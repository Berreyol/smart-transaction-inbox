-- ============================================================================
-- merchant_alias_map: remembers a user's rename of a parser-extracted
-- merchant string, so the next email whose parsed merchant matches the same
-- raw string is stored under the user's preferred name instead of the raw
-- one (e.g. "AMZN MKTP US*2K3AB" -> "Amazon").
--
-- raw_merchant_key is the normalized (trimmed, lowercased) *originally
-- parsed* merchant string — kept exact-on-normalized rather than fuzzy for
-- the same reason as merchant_category_map: a confident wrong substitution
-- is worse than no substitution. This is why pending_transactions gains a
-- separate `raw_merchant` column below: `merchant` may already have been
-- overwritten by a previous alias (or a manual edit) by the time a row is
-- read back, so the original parsed string has to be preserved separately
-- to stay usable as a lookup/comparison key.
-- ============================================================================
alter table public.pending_transactions add column if not exists raw_merchant text;

create table if not exists public.merchant_alias_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  raw_merchant_key text not null,
  display_merchant text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, raw_merchant_key)
);

create index if not exists merchant_alias_map_user_id_idx
  on public.merchant_alias_map (user_id);

alter table public.merchant_alias_map enable row level security;

create policy "Users can view own merchant alias map"
  on public.merchant_alias_map for select
  using (auth.uid() = user_id);

create policy "Users can insert own merchant alias map"
  on public.merchant_alias_map for insert
  with check (auth.uid() = user_id);

create policy "Users can update own merchant alias map"
  on public.merchant_alias_map for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- approve_pending_transaction: also upserts the raw-merchant -> user-chosen
-- display name mapping, when the merchant on the row differs from the raw
-- parsed one (i.e. the user renamed it via the edit flow before approving —
-- see src/store/inboxStore.ts `update`). Signature is unchanged from 0010,
-- so CREATE OR REPLACE is enough — no need to drop the old function first.
-- ----------------------------------------------------------------------------
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
  v_category text;
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

  v_category := coalesce(nullif(trim(p_category), ''), 'uncategorized');

  insert into public.transactions (user_id, amount, type, category, date, merchant, account_id)
  values (
    v_pending.user_id,
    v_pending.amount,
    v_pending.type,
    v_category,
    v_pending.date,
    v_pending.merchant,
    p_account_id
  )
  returning * into v_transaction;

  delete from public.pending_transactions where id = p_pending_id;

  if v_pending.merchant is not null and trim(v_pending.merchant) <> '' then
    insert into public.merchant_category_map (user_id, merchant_key, category)
    values (v_pending.user_id, lower(trim(v_pending.merchant)), v_category)
    on conflict (user_id, merchant_key)
    do update set category = excluded.category, updated_at = now();
  end if;

  if v_pending.raw_merchant is not null and trim(v_pending.raw_merchant) <> ''
    and v_pending.merchant is not null and trim(v_pending.merchant) <> ''
    and lower(trim(v_pending.raw_merchant)) <> lower(trim(v_pending.merchant))
  then
    insert into public.merchant_alias_map (user_id, raw_merchant_key, display_merchant)
    values (v_pending.user_id, lower(trim(v_pending.raw_merchant)), trim(v_pending.merchant))
    on conflict (user_id, raw_merchant_key)
    do update set display_merchant = excluded.display_merchant, updated_at = now();
  end if;

  return v_transaction;
end;
$$;

grant execute on function public.approve_pending_transaction(uuid, text, uuid) to authenticated;
