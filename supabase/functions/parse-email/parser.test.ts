// ============================================================================
// parser.test.ts
// Unit tests for matchBankAccount() (see parser.ts). Run with:
//   deno test supabase/functions/parse-email/parser.test.ts
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import { matchBankAccount } from "./parser.ts";

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
