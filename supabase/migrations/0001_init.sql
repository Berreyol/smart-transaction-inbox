-- ============================================================================
-- Smart Transaction Inbox — initial schema
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- One row per authenticated user. Stores the email the user forwards bank
-- mail FROM (used by the edge function to match Postmark's "From" header)
-- and the Expo push token used to notify them of new pending transactions.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- Case-insensitive matching is critical: Postmark's "From" header casing can
-- vary, but email addresses are effectively case-insensitive for our purposes.
create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Automatically create a profile row when a new auth user signs up, seeded
-- with the email they signed up with (the same address they'll forward from).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. transactions
-- Confirmed transactions, either entered manually or approved from the
-- pending inbox.
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null,
  type text not null check (type in ('income', 'expense')),
  category text not null default 'uncategorized',
  date timestamptz not null default now(),
  merchant text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_date_idx
  on public.transactions (user_id, date desc);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. pending_transactions
-- Inbox queue populated by the parse-email edge function. Awaits user
-- approval/rejection in the app.
-- ----------------------------------------------------------------------------
create table if not exists public.pending_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2),
  type text check (type in ('income', 'expense')),
  merchant text,
  raw_text text not null,
  date timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists pending_transactions_user_id_status_idx
  on public.pending_transactions (user_id, status);

alter table public.pending_transactions enable row level security;

create policy "Users can view own pending transactions"
  on public.pending_transactions for select
  using (auth.uid() = user_id);

create policy "Users can update own pending transactions"
  on public.pending_transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own pending transactions"
  on public.pending_transactions for delete
  using (auth.uid() = user_id);

-- No insert policy for regular users: rows are only ever created by the
-- parse-email edge function, which runs with the service_role key and
-- therefore bypasses RLS entirely. This prevents a user (or anyone with an
-- anon key) from injecting fake pending transactions into another user's
-- inbox via the client.

-- ----------------------------------------------------------------------------
-- 4. Realtime (optional but recommended so the Inbox screen updates live
-- when the edge function inserts a new pending transaction)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.pending_transactions;
