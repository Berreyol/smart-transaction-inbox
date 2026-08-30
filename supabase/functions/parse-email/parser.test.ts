// ============================================================================
// parser.test.ts
// Unit tests for every function in parser.ts: normalizeAmount(),
// detectType(), extractAmount(), decodeEntity(), cleanEmailText(),
// matchBankAccount(), and parseTransactionEmail() (the end-to-end
// extraction that composes all of the above). Run with:
//   deno test supabase/functions/parse-email/parser.test.ts
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import {
  cleanEmailText,
  decodeEntity,
  detectType,
  extractAmount,
  matchBankAccount,
  normalizeAmount,
  parseTransactionEmail,
} from "./parser.ts";

// ----------------------------------------------------------------------------
// normalizeAmount()
// ----------------------------------------------------------------------------

Deno.test("normalizeAmount - comma thousands separator, dot decimal separator", () => {
  assertEquals(normalizeAmount("1,234.56"), 1234.56);
});

Deno.test("normalizeAmount - dot thousands separator, comma decimal separator (European style)", () => {
  assertEquals(normalizeAmount("1.234,56"), 1234.56);
});

Deno.test("normalizeAmount - comma-only input with exactly 2 trailing digits is treated as decimal", () => {
  assertEquals(normalizeAmount("45,00"), 45);
});

Deno.test("normalizeAmount - comma-only input without exactly 2 trailing digits is treated as a thousands separator", () => {
  assertEquals(normalizeAmount("1,234"), 1234);
});

Deno.test("normalizeAmount - dot-only input is treated as a decimal separator", () => {
  assertEquals(normalizeAmount("500.00"), 500);
});

Deno.test("normalizeAmount - plain integer with no separators", () => {
  assertEquals(normalizeAmount("500"), 500);
});

Deno.test("normalizeAmount - always returns a non-negative value", () => {
  assertEquals(normalizeAmount("-50.00"), 50);
});

// ----------------------------------------------------------------------------
// detectType()
// ----------------------------------------------------------------------------

Deno.test("detectType - matches an expense keyword", () => {
  assertEquals(detectType("Se realizó un cargo por $50.00"), "expense");
});

Deno.test("detectType - matches an income keyword", () => {
  assertEquals(detectType("Depósito recibido en tu cuenta"), "income");
});

Deno.test("detectType - checks expense keywords before income keywords when both are present", () => {
  assertEquals(detectType("Depósito por concepto de pago realizado"), "expense");
});

Deno.test("detectType - returns null when no keyword matches", () => {
  assertEquals(detectType("Tu saldo actual es de $500.00"), null);
});

Deno.test("detectType - matches a keyword ending in an accented letter (regression: JS \\b fails right after an accented letter)", () => {
  assertEquals(detectType("Ingresó dinero a tu cuenta"), "income");
});

Deno.test("detectType - is case-insensitive", () => {
  assertEquals(detectType("CARGO EFECTUADO"), "expense");
});

// ----------------------------------------------------------------------------
// extractAmount()
// ----------------------------------------------------------------------------

Deno.test("extractAmount - a currency symbol prefix", () => {
  assertEquals(extractAmount("Cargo por $1,234.56 en OXXO"), 1234.56);
});

Deno.test("extractAmount - a currency code suffix", () => {
  assertEquals(extractAmount("Cargo por 45,00 EUR en tu cuenta"), 45);
});

Deno.test("extractAmount - a currency code prefix", () => {
  assertEquals(extractAmount("Cargo por USD 12.50"), 12.5);
});

Deno.test("extractAmount - returns null when no amount is present", () => {
  assertEquals(extractAmount("Tu sesión ha expirado, vuelve a iniciar sesión"), null);
});

// ----------------------------------------------------------------------------
// decodeEntity()
// ----------------------------------------------------------------------------

Deno.test("decodeEntity - decodes a known named entity", () => {
  assertEquals(decodeEntity("&nbsp;"), " ");
  assertEquals(decodeEntity("&amp;"), "&");
});

Deno.test("decodeEntity - decodes a decimal numeric entity", () => {
  assertEquals(decodeEntity("&#36;"), "$");
});

Deno.test("decodeEntity - decodes a hexadecimal numeric entity", () => {
  assertEquals(decodeEntity("&#x24;"), "$");
});

Deno.test("decodeEntity - an unrecognized named entity decodes to an empty string", () => {
  assertEquals(decodeEntity("&foo;"), "");
});

// ----------------------------------------------------------------------------
// cleanEmailText()
// ----------------------------------------------------------------------------

Deno.test("cleanEmailText - strips HTML tags", () => {
  assertEquals(cleanEmailText("Monto: <b>$500.00</b>"), "Monto: $500.00");
});

Deno.test("cleanEmailText - strips HTML comments", () => {
  assertEquals(cleanEmailText("Monto: $500.00<!-- promo -->"), "Monto: $500.00");
});

Deno.test("cleanEmailText - decodes named and numeric entities", () => {
  assertEquals(cleanEmailText("Monto:&nbsp;&#36;500.00"), "Monto: $500.00");
});

Deno.test("cleanEmailText - collapses horizontal whitespace but preserves newlines", () => {
  assertEquals(cleanEmailText("Monto:   $500.00  \n\n  en tu cuenta"), "Monto: $500.00\n\nen tu cuenta");
});

Deno.test("cleanEmailText - trims leading and trailing whitespace", () => {
  assertEquals(cleanEmailText("  Monto: $500.00  "), "Monto: $500.00");
});

Deno.test("matchBankAccount - matches an alias found verbatim in the email text", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "Costco Banamex" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - matches case-insensitively", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "costco banamex" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - matches even when immediately followed by masked digits with no separating space", () => {
  const email = "COSTCO BANAMEX**854";
  const accounts = [{ id: "1", account_alias: "Costco Banamex" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - returns null when no account's alias appears in the email", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "BBVA Nomina" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, null);
});

Deno.test("matchBankAccount - an empty-string alias never matches (guards \"\".includes(\"\"))", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, null);
});

Deno.test("matchBankAccount - a whitespace-only alias never matches", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "   " }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, null);
});

Deno.test("matchBankAccount - with multiple accounts, returns the one whose alias actually appears", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [
    { id: "1", account_alias: "BBVA Nomina" },
    { id: "2", account_alias: "Costco Banamex" },
    { id: "3", account_alias: "Santander Debito" },
  ];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[1]);
});

Deno.test("matchBankAccount - with multiple matching accounts, returns the first one in array order", () => {
  const email = "Cargo en COSTCO BANAMEX**854, relacionado a BBVA NOMINA";
  const accounts = [
    { id: "1", account_alias: "BBVA Nomina" },
    { id: "2", account_alias: "Costco Banamex" },
  ];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - trims leading/trailing whitespace on the saved alias before matching", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";
  const accounts = [{ id: "1", account_alias: "  Costco Banamex  " }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - returns null for an empty accounts array without throwing", () => {
  const email = "Se realizo un cargo en COSTCO BANAMEX**854 por $1,234.00";

  const result = matchBankAccount(email, []);

  assertEquals(result, null);
});

Deno.test("matchBankAccount - a short alias can match as a substring inside a longer word (known trade-off)", () => {
  // Documents current substring-matching behavior rather than a requirement:
  // a generic/short alias like "BBVA" matches inside "BBVANET", which may be
  // a false positive in practice. Pinning this down here means a future
  // change to stricter (e.g. word-boundary) matching is a deliberate,
  // visible decision rather than an accidental behavior change.
  const email = "Aviso de BBVANET: transferencia enviada";
  const accounts = [{ id: "1", account_alias: "BBVA" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - falls back to bank_name when the alias doesn't appear in the email", () => {
  const email = "Ir a Mercado pago\nTus $ 21,000.00 ya están disponibles";
  const accounts = [{ id: "1", account_alias: "Wallet", bank_name: "Mercado Pago" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - array order still decides the winner when one account matches by alias and an earlier one matches by bank_name", () => {
  const email = "Cargo en COSTCO BANAMEX**854 relacionado a tu cuenta Mercado Pago";
  const accounts = [
    { id: "1", account_alias: "Wallet", bank_name: "Mercado Pago" },
    { id: "2", account_alias: "Costco Banamex", bank_name: "Banamex" },
  ];

  const result = matchBankAccount(email, accounts);

  // Account 2's alias ("Costco Banamex") appears in the email too, but
  // account 1 comes first in array order and already matches via bank_name
  // ("Mercado Pago") — find() returns it without ever reaching account 2,
  // same array-order precedence as plain alias-vs-alias matching.
  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - bank_name \"Other\" (the catch-all placeholder) never matches, even though it's a literal substring of many words", () => {
  const email = "Se aplicó otro cargo a tu cuenta";
  const accounts = [{ id: "1", account_alias: "Mi cuenta", bank_name: "Other" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, null);
});

Deno.test("matchBankAccount - an alias literally named \"Other\" still matches normally (the placeholder guard only applies to bank_name)", () => {
  const email = "Cargo en Other Bank Inc.";
  const accounts = [{ id: "1", account_alias: "Other", bank_name: "Other" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - bank_name matching is case-insensitive", () => {
  const email = "Notificación de mercado pago: tu compra fue exitosa";
  const accounts = [{ id: "1", account_alias: "Wallet", bank_name: "Mercado Pago" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, accounts[0]);
});

Deno.test("matchBankAccount - an account with neither a matching alias nor a matching bank_name doesn't match", () => {
  const email = "Cargo en OXXO por $50.00";
  const accounts = [{ id: "1", account_alias: "Wallet", bank_name: "Mercado Pago" }];

  const result = matchBankAccount(email, accounts);

  assertEquals(result, null);
});

// ----------------------------------------------------------------------------
// Mercado Pago: no bank-specific logic anymore — it's just another saved
// bank_accounts row (bank_name "Mercado Pago"), identified via
// matchBankAccount() like any other bank, and its emails go entirely through
// the generic engine below.
// ----------------------------------------------------------------------------

Deno.test("parseTransactionEmail - a Mercado Pago purchase notification is handled by the generic engine", () => {
  const result = parseTransactionEmail("Realizaste una compra por $250.00 en Mercado Pago");

  assertEquals(result.amount, 250);
  assertEquals(result.type, "expense");
});

Deno.test("parseTransactionEmail - a 'depósito' notification is classified as income by the generic engine", () => {
  const result = parseTransactionEmail("Aviso de depósito. Se realizó un depósito de $500.00 en tu cuenta.");

  assertEquals(result.amount, 500);
  assertEquals(result.type, "income");
});

Deno.test("parseTransactionEmail - Mercado Pago's 'Ingresó' subject is classified as income (regression: JS \\b fails right after an accented letter)", () => {
  // "Ingresó" ends in an accented "ó", which JS's \b treats as a non-word
  // character — a plain /\bingres[oó]\b/ regex silently never matches this
  // word (only the unaccented "Ingreso" form), which is why the keyword
  // regexes use a Unicode-aware boundary lookaround instead of \b.
  const result = parseTransactionEmail("cuerpo sin palabras clave $500.00", "Ingresó dinero a tu cuenta");

  assertEquals(result.type, "income");
});

Deno.test("parseTransactionEmail - Mercado Pago's 'funds available' wording isn't classified by the generic engine (known gap — falls back to manual review)", () => {
  // Documents a real, currently-unhandled Mercado Pago phrasing ("ya están
  // disponibles") since "disponible" isn't generic-keyword material — it's
  // common in routine "saldo disponible" balance blurbs from unrelated
  // banks and would false-positive income there if added to INCOME_KEYWORDS.
  // Amount still extracts fine; type comes back null, same as any other
  // email the generic engine can't confidently classify, and the user picks
  // it manually when approving.
  const email = "Ir a Mercado pago\nTus $ 21,000.00 ya están disponibles";

  const result = parseTransactionEmail(email);

  assertEquals(result.amount, 21000);
  assertEquals(result.type, null);
});

// ----------------------------------------------------------------------------
// HTML/entity cleanup applied inside parseTransactionEmail (cleanEmailText,
// not exported — tested here through its observable effect on extraction).
// ----------------------------------------------------------------------------

Deno.test("parseTransactionEmail - extracts the amount past stray tags and named/numeric HTML entities", () => {
  const email = "Se hizo un cargo por <b>&#36;500.00</b>&nbsp;en<!-- promo --> OXXO";

  const result = parseTransactionEmail(email);

  assertEquals(result.amount, 500);
  assertEquals(result.merchant, "OXXO");
});

Deno.test("parseTransactionEmail - a literal non-breaking space (not just the &nbsp; entity) next to the amount doesn't break extraction", () => {
  const email = "Cargo por $500.00 en OXXO";

  const result = parseTransactionEmail(email);

  assertEquals(result.amount, 500);
  assertEquals(result.merchant, "OXXO");
});

Deno.test("parseTransactionEmail - falls back to the HTML body for merchant when the plain-text body has no match (regression: Banamex sends an empty text part)", () => {
  const html =
    '<table><tr><td><p>Monto</p></td><td><p><b>$632.50</b></p></td></tr>' +
    '<tr><td><p>Establecimiento</p></td><td><p><b>MITSPUG*REST CASA REGITLA</b></p></td></tr>' +
    '<tr><td><p>Fecha y hora</p></td><td><p><b>2026/08/29 12:36:39 PM</b></p></td></tr></table>';

  const result = parseTransactionEmail("", "Retiro/Compra con tarjeta Banamex", html);

  assertEquals(result.amount, 632.5);
  assertEquals(result.type, "expense");
  assertEquals(result.merchant, "MITSPUG*REST CASA REGITLA");
});

Deno.test("parseTransactionEmail - merchant match in the plain-text body wins over the HTML body when both are present", () => {
  const result = parseTransactionEmail("Cargo en OXXO por $50.00", undefined, "<p>Establecimiento</p><p>COSTCO</p>");

  assertEquals(result.merchant, "OXXO");
});

Deno.test("cleanEmailText - converts block-level tag boundaries to newlines instead of spaces (regression: table cells with no literal newline in the source ran a field's label into its value and the next label)", () => {
  const html = "<table><tr><td>Establecimiento</td><td>MITSPUG*REST CASA REGITLA</td></tr><tr><td>Fecha</td></tr></table>";

  // Adjacent tags (</td><td>, </tr><tr>) each contribute their own newline,
  // so runs of blank lines are expected here — the exact count is
  // incidental to markup structure, not a contract. What matters is that
  // each field ends up on its own line with no blank-line collapsing that
  // would merge it into a neighbor.
  const lines = cleanEmailText(html).split("\n").filter(Boolean);
  assertEquals(lines, ["Establecimiento", "MITSPUG*REST CASA REGITLA", "Fecha"]);
});

// ----------------------------------------------------------------------------
// HTML-structure regression: amount and merchant separated by real markup.
//
// index.ts passes payload.html (the *raw* HTML, tags and all) as parser.ts's
// `html` argument — not its own pre-flattened htmlToText() output — so
// cleanEmailText()'s tag handling above is what actually runs on production
// bank emails. These tests each embed the amount and merchant fields inside
// different real-world tag structures to confirm both values keep resolving
// correctly regardless of what HTML sits between (and inside) them.
// ----------------------------------------------------------------------------

Deno.test("parseTransactionEmail (HTML) - amount and merchant in separate table rows, each nested in <p><b>", () => {
  // Same shape as the real Banamex "Retiro/Compra" template: a two-column
  // table where every label and every value is its own <td><p><b>...</b></p>,
  // and the whole document is one unbroken line with no literal newlines.
  const html =
    "<table>" +
    "<tr><td><p>Monto</p></td><td><p><b>$1,250.00</b></p></td></tr>" +
    "<tr><td><p>Establecimiento</p></td><td><p><b>WALMART*SUPERCENTER</b></p></td></tr>" +
    "<tr><td><p>Fecha y hora</p></td><td><p><b>2026/08/29 10:00:00 AM</b></p></td></tr>" +
    "</table>";

  const result = parseTransactionEmail("", "Retiro/Compra con tarjeta", html);

  assertEquals(result.amount, 1250);
  assertEquals(result.merchant, "WALMART*SUPERCENTER");
});

Deno.test("parseTransactionEmail (HTML) - amount and merchant on the same line, separated only by inline tags (<span>/<b>), still resolve independently", () => {
  const html = 'Cargo por <span style="color:red"><b>$75.30</b></span> en <b><span>OXXO*TIENDA</span></b>.';

  const result = parseTransactionEmail("", undefined, html);

  assertEquals(result.amount, 75.3);
  assertEquals(result.merchant, "OXXO*TIENDA");
});

Deno.test("parseTransactionEmail (HTML) - amount and merchant separated by a <div> block and a <br>, with an HTML comment sitting between them", () => {
  const html =
    "<div>Monto: <b>$99.99</b></div>" +
    "<!-- internal tracking pixel --><br>" +
    "<div>Comercio: <b>STARBUCKS*DOWNTOWN</b></div>";

  const result = parseTransactionEmail("", undefined, html);

  assertEquals(result.amount, 99.99);
  // "Comercio" isn't one of MERCHANT_REGEX's label keywords, so this
  // documents current behavior (merchant comes back null here) rather than
  // asserting extraction that isn't implemented — the point of this test is
  // that the amount from the OTHER field still resolves cleanly even though
  // an unrelated field, a comment, and a <br> sit between them.
  assertEquals(result.merchant, null);
});

Deno.test("parseTransactionEmail (HTML) - amount and merchant each nested several tags deep inside adjacent table cells with masked-card asterisks and HTML entities", () => {
  const html =
    "<table><tbody>" +
    "<tr><td><span><p>Monto</p></span></td><td><div><p><b>&#36;2,048.75</b></p></div></td></tr>" +
    "<tr><td><span><p>Establecimiento</p></span></td><td><div><p><b>AMZN*MKTP MX</b></p></div></td></tr>" +
    "</tbody></table>";

  const result = parseTransactionEmail("", undefined, html);

  assertEquals(result.amount, 2048.75);
  assertEquals(result.merchant, "AMZN*MKTP MX");
});

Deno.test("parseTransactionEmail (HTML) - falls back to HTML for both amount and merchant when the plain-text part is present but doesn't mention either", () => {
  const text = "Tu estado de cuenta ya está disponible para consulta.";
  const html =
    "<table><tr><td><p>Monto</p></td><td><p><b>$430.00</b></p></td></tr>" +
    "<tr><td><p>Establecimiento</p></td><td><p><b>COSTCO WHOLESALE</b></p></td></tr></table>";

  const result = parseTransactionEmail(text, undefined, html);

  assertEquals(result.amount, 430);
  assertEquals(result.merchant, "COSTCO WHOLESALE");
});
