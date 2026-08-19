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

// Keywords that indicate money leaving the account (Spanish + English banks).
const EXPENSE_KEYWORDS =
  /\b(retiro|cargo|compra|pago realizado|pago de|debito|d[eé]bito|spent|purchase|payment (?:made|of)|withdrawal|debit)\b/i;

// Keywords that indicate money entering the account.
const INCOME_KEYWORDS =
  /\b(dep[oó]sito|abono|ingreso|recibido|transferencia recibida|received|deposit|credit(ed)?|refund|reembolso)\b/i;

// Matches a currency amount, e.g. "$1,234.56", "€45.00", "1.234,56", "45,00 EUR", "USD 12.50"
// Captures the numeric portion only; sign/currency symbols are stripped separately.
const AMOUNT_REGEX =
  /(?:USD|EUR|MXN|COP|ARS|CLP|\$|€|£)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(?:USD|EUR|MXN|COP|ARS|CLP|PESOS|D[OÓ]LARES)/i;

// Merchant name is typically introduced by "en", "at", "to", "from", "in" followed
// by a capitalized token sequence, stopping at punctuation or a trailing "por/for".
const MERCHANT_REGEX =
  /\b(?:en|at|to|from|in)\s+([A-Z0-9][A-Za-z0-9&.,'\- ]{1,40}?)(?=\s*(?:[.,;\n]|\bpor\b|\bfor\b|\bel\s\d|\bon\s\d|\bwas\b|\bis\b|\bhas\b|\bhad\b|$))/;

/**
 * Normalizes a raw amount string like "1.234,56" or "1,234.56" into a float.
 * Heuristic: if both separators are present, the last one is the decimal
 * separator; if only a comma is present with exactly 2 trailing digits, treat
 * it as decimal (European style), otherwise treat it as a thousands separator.
 */
function normalizeAmount(raw: string): number {
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

/**
 * Extracts amount, type, and merchant from a forwarded bank email body.
 * Returns nulls for any field it can't confidently detect; the caller
 * decides whether that's still worth surfacing to the user for manual review.
 */
export function parseTransactionEmail(text: string): ParsedTransaction {
  const body = text.replace(/\r\n/g, "\n");

  const amountMatch = body.match(AMOUNT_REGEX);
  const rawAmount = amountMatch?.[1] ?? amountMatch?.[2] ?? null;
  const amount = rawAmount ? normalizeAmount(rawAmount) : null;

  let type: TransactionType | null = null;
  if (EXPENSE_KEYWORDS.test(body)) {
    type = "expense";
  } else if (INCOME_KEYWORDS.test(body)) {
    type = "income";
  }

  const merchantMatch = body.match(MERCHANT_REGEX);
  const merchant = merchantMatch?.[1]?.trim() ?? null;

  return { amount, type, merchant };
}
