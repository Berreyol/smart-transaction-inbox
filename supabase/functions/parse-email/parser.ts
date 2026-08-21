// ============================================================================
// parser.ts
// Pure regex-based extraction of transaction data from forwarded bank email
// bodies. Kept dependency-free and framework-agnostic so it can be unit
// tested in isolation from the HTTP handler.
// ============================================================================

export type TransactionType = "income" | "expense";

export interface ParsedTransaction {
  amount: number | null;
  type: TransactionType | null;
  merchant: string | null;
}

// Word-boundary lookaround used instead of \b below: JS's \b treats \w as
// [A-Za-z0-9_] only, not Unicode letters, so a keyword ending right on an
// accented character (e.g. "ingres[oó]" matching "Ingresó") would silently
// never match — \b immediately after "ó" isn't a real boundary since "ó"
// itself already reads as non-word to \b. \p{L}/\p{N} (with the /u flag)
// make "is this a letter/digit" locale-aware instead.
const NOT_WORD_CHAR = String.raw`(?![\p{L}\p{N}_])`;
const NOT_WORD_CHAR_BEHIND = String.raw`(?<![\p{L}\p{N}_])`;

// Keywords that indicate money leaving the account (Spanish + English banks).
const EXPENSE_KEYWORDS = new RegExp(
  `${NOT_WORD_CHAR_BEHIND}(retiro|cargo|compra|pago realizado|pago de|debito|d[eé]bito|spent|purchase|payment (?:made|of)|withdrawal|debit)${NOT_WORD_CHAR}`,
  "iu",
);

// Keywords that indicate money entering the account.
const INCOME_KEYWORDS = new RegExp(
  `${NOT_WORD_CHAR_BEHIND}(dep[oó]sito|abono|ingres[oó]|recibido|transferencia recibida|received|deposit|credit(ed)?|refund|reembolso)${NOT_WORD_CHAR}`,
  "iu",
);

// Matches a currency amount, e.g. "$1,234.56", "€45.00", "1.234,56", "45,00 EUR", "USD 12.50"
// Captures the numeric portion only; sign/currency symbols are stripped separately.
const AMOUNT_REGEX =
  /(?:USD|EUR|MXN|COP|ARS|CLP|\$|€|£)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(?:USD|EUR|MXN|COP|ARS|CLP|PESOS|D[OÓ]LARES)/i;

// Merchant name is typically introduced by "en", "at", "to", "from", "in" followed
// by a capitalized token sequence, stopping at punctuation or a trailing "por/for".
const MERCHANT_REGEX =
  /\b(?:en|at|to|from|in)\s+([A-Z0-9][A-Za-z0-9&.,'\- ]{1,40}?)(?=\s*(?:[.,;\n]|\bpor\b|\bfor\b|\bel\s\d|\bon\s\d|\bwas\b|\bis\b|\bhas\b|\bhad\b|$))/;

// ----------------------------------------------------------------------------
// HTML/entity cleanup. Belt-and-suspenders on top of index.ts's htmlToText()
// (which only decodes &nbsp;/&amp;) — this runs independently of whatever
// shape the caller's text arrived in, so parser.ts stays robust even if
// called with unprocessed HTML. Applied to the body/html before every other
// extraction below, so a stray tag or entity sitting right next to the
// amount (e.g. a styled `<span>` or a literal non-breaking space) can't
// break AMOUNT_REGEX's match. Horizontal whitespace (spaces/tabs/nbsp) is
// collapsed, but newlines are preserved — MERCHANT_REGEX uses "\n" as a stop
// boundary.
// ----------------------------------------------------------------------------

// Named entities beyond the two htmlToText (index.ts) already decodes, plus
// numeric entities (&#36; / &#x24;) decoded generically below.
const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntity(entity: string): string {
  const named = NAMED_ENTITIES[entity.toLowerCase()];
  if (named) return named;
  const numericMatch = entity.match(/^&#(x[0-9a-f]+|\d+);$/i);
  if (!numericMatch) return "";
  const codePoint = /^x/i.test(numericMatch[1]) ? parseInt(numericMatch[1].slice(1), 16) : parseInt(numericMatch[1], 10);
  return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
}

function cleanEmailText(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * Normalizes a raw amount string like "1.234,56" or "1,234.56" into a float.
 * Heuristic: if both separators are present, the last one is the decimal
 * separator; if only a comma is present with exactly 2 trailing digits, treat
 * it as decimal (European style), otherwise treat it as a thousands separator.
 */
export function normalizeAmount(raw: string): number {
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  let cleaned = raw;
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    cleaned = raw.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (hasComma) {
    const decimalsAfterComma = raw.length - raw.lastIndexOf(",") - 1;
    cleaned = decimalsAfterComma === 2 ? raw.replace(",", ".") : raw.replace(/,/g, "");
  }

  return Math.abs(parseFloat(cleaned));
}

function detectType(text: string): TransactionType | null {
  if (EXPENSE_KEYWORDS.test(text)) return "expense";
  if (INCOME_KEYWORDS.test(text)) return "income";
  return null;
}

function extractAmount(source: string): number | null {
  const match = source.match(AMOUNT_REGEX);
  const raw = match?.[1] ?? match?.[2] ?? null;
  return raw ? normalizeAmount(raw) : null;
}

/**
 * Finds which of the user's saved bank accounts (if any) an email is for, by
 * checking whether that account's alias appears verbatim, case-insensitively,
 * anywhere in the email text — e.g. an account aliased "Costco Banamex"
 * matches a body containing "COSTCO BANAMEX**854". Returns the first match in
 * `accounts` order (callers control priority via that ordering); an
 * empty/whitespace-only alias never matches, since `"".includes("")` would
 * otherwise match everything.
 */
export function matchBankAccount<T extends { account_alias: string }>(
  searchText: string,
  accounts: T[],
): T | null {
  const haystack = searchText.toLowerCase();
  return (
    accounts.find((account) => {
      const alias = account.account_alias.trim().toLowerCase();
      return alias.length > 0 && haystack.includes(alias);
    }) ?? null
  );
}

/**
 * Extracts amount, type, and merchant from a forwarded bank email. Type is
 * looked up in the subject line first — bank notification subjects ("Aviso
 * de depósito", "You made a purchase") tend to state it more reliably than
 * the body — falling back to the body if the subject doesn't yield a match.
 * Amount is looked up in the plain-text body first, falling back to the
 * HTML-derived body if given — some bank templates render the amount inside
 * markup (e.g. a styled `<span>`) that doesn't survive into the mail
 * provider's plain-text part, so the amount only shows up in the HTML.
 * Returns nulls for any field it can't confidently detect; the caller
 * decides whether that's still worth surfacing to the user for manual review.
 */
export function parseTransactionEmail(text: string, subject?: string, html?: string): ParsedTransaction {
  const body = cleanEmailText(text.replace(/\r\n/g, "\n"));

  const amount = extractAmount(body) ?? (html ? extractAmount(cleanEmailText(html.replace(/\r\n/g, "\n"))) : null);

  const type = (subject ? detectType(subject) : null) ?? detectType(body);

  const merchantMatch = body.match(MERCHANT_REGEX);
  const merchant = merchantMatch?.[1]?.trim() ?? null;

  return { amount, type, merchant };
}
