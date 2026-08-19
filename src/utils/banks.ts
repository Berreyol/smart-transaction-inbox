// Fixed list backing the bank picker in the Accounts modal. A free-text
// column (bank_accounts.bank_name) rather than a DB enum, so adding a bank
// here doesn't need a migration — just keep this in sync with whichever
// banks have a parser in supabase/functions/parse-email/parsers/.
export const SUPPORTED_BANKS = [
  "Banamex",
  "BBVA",
  "Santander",
  "Banorte",
  "HSBC",
  "Scotiabank",
  "Other",
];
