// ============================================================================
// BanamexParser: dummy first bank-specific implementation, meant to prove
// out the Strategy Pattern rather than parse real Banamex templates yet —
// swap `parse` for real Banamex-specific extraction once sample emails are
// available. matchStrategy is the part that matters today: it's what makes
// this parser apply instead of the generic fallback.
// ============================================================================
import { parseTransactionEmail } from "../parser.ts";
import type { BankParser } from "./types.ts";

const BANAMEX_NAME_RE = /banamex|citibanamex/i;

export const banamexParser: BankParser = {
  bankName: "Banamex",

  matchStrategy: (text, subject) => BANAMEX_NAME_RE.test(subject) || BANAMEX_NAME_RE.test(text),

  parse: (text) => {
    const { amount, type, merchant } = parseTransactionEmail(text);
    return { amount, type, merchant, date: new Date().toISOString() };
  },
};
