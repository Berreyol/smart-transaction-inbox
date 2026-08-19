-- ============================================================================
-- approve_pending_transaction
--
-- Atomically moves a pending transaction into `transactions` (tagged with
-- the user-chosen category) and removes it from `pending_transactions`.
-- Wrapping this in a single function call makes the "approve" action a
-- single Postgres transaction, so a client-side failure between an insert
-- and a delete can't leave a duplicated or half-moved row behind.
--
-- SECURITY INVOKER (the default) runs the function as the calling user, so
-- normal RLS policies on both tables still apply — this function grants no
-- extra privileges, it only makes an existing two-step operation atomic.
-- ============================================================================
create or replace function public.approve_pending_transaction(
  p_pending_id uuid,
  p_category text
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

  insert into public.transactions (user_id, amount, type, category, date, merchant)
  values (
    v_pending.user_id,
    v_pending.amount,
    v_pending.type,
    coalesce(nullif(trim(p_category), ''), 'uncategorized'),
    v_pending.date,
    v_pending.merchant
  )
  returning * into v_transaction;

  delete from public.pending_transactions where id = p_pending_id;

  return v_transaction;
end;
$$;

grant execute on function public.approve_pending_transaction(uuid, text) to authenticated;
