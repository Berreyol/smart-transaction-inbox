// ============================================================================
// BankParser: the Strategy Pattern interface every bank-specific parser
// implements. Adding support for a new bank means adding one new file in
// this directory that exports a BankParser and registering it in index.ts —
// nothing else in the edge function needs to change.
// ============================================================================
import type { TransactionType } from "../parser.ts";

export interface ParsedBankTransaction {
  amount: number | null;
  type: TransactionType | null;
  merchant: string | null;
  date: string;
}

export interface BankParser {
  /** Human-readable bank name stored on the pending_transactions row (e.g. "Banamex"). */
  bankName: string;
  /** Returns true if this email looks like it came from this bank. Checked in registry order — see index.ts. */
  matchStrategy(text: string, subject: string): boolean;
  /** Extracts transaction details once this parser has been selected for the email. */
  parse(text: string): ParsedBankTransaction;
}
