-- ----------------------------------------------------------------------------
-- pending_transactions.account_id: a saved bank_accounts row the parse-email
-- edge function matched by finding that account's account_alias verbatim
-- (case-insensitively) inside the forwarded email — e.g. an account aliased
-- "Costco Banamex" matches a body containing "COSTCO BANAMEX**854". This is
-- only a suggestion the Inbox can pre-fill; the user still confirms (or
-- overrides) the account at approval time via BankAccountPickerModal, same
-- as before. Nullable and ON DELETE SET NULL for the same reason as
-- transactions.account_id (0007): losing a saved account should never delete
-- pending review items, only un-tag them.
-- ----------------------------------------------------------------------------
alter table public.pending_transactions
  add column if not exists account_id uuid references public.bank_accounts (id) on delete set null;

create index if not exists pending_transactions_account_id_idx
  on public.pending_transactions (account_id);
