// ============================================================================
// Parser registry. Adding a new bank means adding one file in this directory
// that exports a BankParser (see banamex.ts for the shape) and adding it to
// PARSERS below — nothing in index.ts (the webhook handler) needs to change.
//
// Order matters: selectParser() returns the first match, and
// genericBankParser's matchStrategy always returns true, so it must stay
// last — every other parser is checked before falling back to it.
// ============================================================================
import { banamexParser } from "./banamex.ts";
import { genericBankParser } from "./generic.ts";
import { mercadoPagoParser } from "./mercadopago.ts";
import type { BankParser } from "./types.ts";

export const PARSERS: BankParser[] = [banamexParser, mercadoPagoParser, genericBankParser];

/** Returns the first parser whose matchStrategy matches this email, falling back to the generic one. */
export function selectParser(text: string, subject: string): BankParser {
  return PARSERS.find((parser) => parser.matchStrategy(text, subject)) ?? genericBankParser;
}

export type { BankParser, ParsedBankTransaction } from "./types.ts";
