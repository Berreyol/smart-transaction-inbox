-- ============================================================================
-- forwarding_confirmations: tracks the Gmail "confirm auto-forwarding"
-- request that Google emails to a user's personalized inbound address the
-- first time they set up mail forwarding to it. Populated by parse-email's
-- forwarding-confirmation branch, which also attempts to auto-confirm the
-- request server-side by fetching the confirmation URL —
-- rows land here either already resolved (status = 'auto_confirmed') or
-- still needing the user to tap through it themselves (status = 'pending').
--
-- No insert policy for regular users, same reasoning as pending_transactions
-- (0001_init.sql): rows are only ever created by the edge function running
-- as service_role, which bypasses RLS. The update policy IS open to the
-- owning user, since letting them mark a row 'manually_confirmed' or
-- 'dismissed' from the app is a legitimate, non-sensitive action — it only
-- affects what's displayed to them, not any financial data.
-- ============================================================================
create table if not exists public.forwarding_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_email text,
  confirmation_url text not null,
  status text not null default 'pending'
    check (status in ('pending', 'auto_confirmed', 'manually_confirmed', 'dismissed')),
  auto_confirm_error text,
  created_at timestamptz not null default now()
);

create index if not exists forwarding_confirmations_user_id_status_idx
  on public.forwarding_confirmations (user_id, status);

alter table public.forwarding_confirmations enable row level security;

create policy "Users can view own forwarding confirmations"
  on public.forwarding_confirmations for select
  using (auth.uid() = user_id);

create policy "Users can update own forwarding confirmations"
  on public.forwarding_confirmations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.forwarding_confirmations;
