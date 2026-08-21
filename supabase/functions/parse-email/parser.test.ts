// ============================================================================
// parser.test.ts
// Unit tests for parser.ts: matchBankAccount() and parseTransactionEmail()
// (including the HTML/entity cleanup applied before extraction). Run with:
//   deno test supabase/functions/parse-email/parser.test.ts
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import { matchBankAccount, parseTransactionEmail } from "./parser.ts";

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
