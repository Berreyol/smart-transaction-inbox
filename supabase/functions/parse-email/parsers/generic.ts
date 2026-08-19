// ============================================================================
// GenericBankParser: the fallback strategy used when no bank-specific parser
// matches. matchStrategy always returns true, so the registry (index.ts)
// must keep this one last — it's a catch-all, not a real bank match.
// Delegates the actual extraction to the shared regex engine in parser.ts,
// which is exactly what parse-email did before bank-specific parsers
// existed, so behavior for unrecognized banks is unchanged.
// ============================================================================
import { parseTransactionEmail } from "../parser.ts";
import type { BankParser } from "./types.ts";

export const genericBankParser: BankParser = {
  bankName: "Generic",

  matchStrategy: () => true,

  parse: (text) => {
    const { amount, type, merchant } = parseTransactionEmail(text);
    // No date extraction in the shared regex engine yet — "now" matches the
    // pending_transactions.date column's own default, so this is a no-op
    // improvement over the pre-refactor behavior, not a regression.
    return { amount, type, merchant, date: new Date().toISOString() };
  },
};
