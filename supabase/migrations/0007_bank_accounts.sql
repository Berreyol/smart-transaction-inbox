-- ============================================================================
-- bank_accounts: per-user list of bank accounts a transaction can be tagged
-- with. bank_name is a free-text label chosen from a fixed list in the app
-- (see src/utils/banks.ts) rather than an enum here, so adding a new
-- supported bank never requires a migration. account_alias is the user's own
-- label for the account (e.g. "Main Debit") since someone can have more than
-- one account at the same bank.
-- ============================================================================
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bank_name text not null,
  account_alias text not null,
  created_at timestamptz not null default now()
);

create index if not exists bank_accounts_user_id_idx
  on public.bank_accounts (user_id);

alter table public.bank_accounts enable row level security;

create policy "Users can view own bank accounts"
  on public.bank_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own bank accounts"
  on public.bank_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bank accounts"
  on public.bank_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own bank accounts"
  on public.bank_accounts for delete
  using (auth.uid() = user_id);

-- Same realtime setup as categories (see 0005) so the accounts list and any
-- screen filtering by account live-update across devices.
alter publication supabase_realtime add table public.bank_accounts;
alter table public.bank_accounts replica identity full;

-- ----------------------------------------------------------------------------
-- transactions.account_id: which saved bank account a confirmed transaction
-- belongs to. Nullable — manually-entered transactions and transactions
-- approved before this column existed have no account. ON DELETE SET NULL
-- (rather than CASCADE) so deleting a bank account never deletes transaction
-- history, only un-tags it.
-- ----------------------------------------------------------------------------
alter table public.transactions
  add column if not exists account_id uuid references public.bank_accounts (id) on delete set null;

create index if not exists transactions_account_id_idx
  on public.transactions (account_id);

-- ----------------------------------------------------------------------------
-- pending_transactions.bank_name: which bank the parse-email edge function's
-- parser strategy identified, shown in the Inbox so the user has context
-- before they pick (or skip) a saved account at approval time. Free text,
-- same reasoning as bank_accounts.bank_name above — this is the parser's
-- `bankName`, not a foreign key, since a pending row isn't tied to any one
-- of the user's saved accounts yet.
-- ----------------------------------------------------------------------------
alter table public.pending_transactions
  add column if not exists bank_name text;

-- ----------------------------------------------------------------------------
-- approve_pending_transaction: extended to accept an optional account_id so
-- the account chosen in the approval UI carries over to the resulting
-- transaction. Signature changed (new third parameter), so the old two-arg
-- overload is dropped rather than left dangling — see 0002_approve_pending_transaction.sql
-- for the original definition/rationale (still SECURITY INVOKER, still one
-- atomic move from pending_transactions into transactions).
-- ----------------------------------------------------------------------------
drop function if exists public.approve_pending_transaction(uuid, text);

create or replace function public.approve_pending_transaction(
  p_pending_id uuid,
  p_category text,
  p_account_id uuid default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pending public.pending_transactions;
  v_transaction public.transactions;
begin
  select * into v_pending
  from public.pending_transactions
  where id = p_pending_id
    and user_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending transaction not found or already processed';
  end if;

  if v_pending.amount is null or v_pending.type is null then
    raise exception 'Cannot approve a transaction with a missing amount or type';
  end if;

  -- An account_id must belong to the same user — a stale/foreign id (e.g. a
  -- deleted or someone else's account) is silently ignored rather than
  -- failing the whole approval, since the pending transaction itself is
  -- still valid to approve either way.
  if p_account_id is not null and not exists (
    select 1 from public.bank_accounts
    where id = p_account_id and user_id = auth.uid()
  ) then
    p_account_id := null;
  end if;

  insert into public.transactions (user_id, amount, type, category, date, merchant, account_id)
  values (
    v_pending.user_id,
    v_pending.amount,
    v_pending.type,
    coalesce(nullif(trim(p_category), ''), 'uncategorized'),
    v_pending.date,
    v_pending.merchant,
    p_account_id
  )
  returning * into v_transaction;

  delete from public.pending_transactions where id = p_pending_id;

  return v_transaction;
end;
$$;

grant execute on function public.approve_pending_transaction(uuid, text, uuid) to authenticated;
