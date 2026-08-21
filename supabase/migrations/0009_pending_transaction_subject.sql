alter table public.pending_transactions
  add column if not exists subject text;