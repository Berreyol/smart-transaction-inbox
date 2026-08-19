-- ============================================================================
-- categories: per-user, per-type list of transaction categories. Replaces
-- the hardcoded EXPENSE_CATEGORIES/INCOME_CATEGORIES arrays that used to
-- live in src/utils/categories.ts — same default names, but now user-owned
-- rows that support CRUD from the app instead of a fixed list.
-- ============================================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

create index if not exists categories_user_id_type_idx
  on public.categories (user_id, type);

alter table public.categories enable row level security;

create policy "Users can view own categories"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "Users can insert own categories"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own categories"
  on public.categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own categories"
  on public.categories for delete
  using (auth.uid() = user_id);

-- Follow the same realtime setup as transactions/pending_transactions
-- (see 0003/0004) so the Categories screen live-updates across devices.
alter publication supabase_realtime add table public.categories;
alter table public.categories replica identity full;

-- Seed defaults for every new user going forward, alongside the existing
-- profile row creation.
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

  insert into public.categories (user_id, name, type)
  select new.id, c.name, c.type
  from (values
    ('Food & Dining', 'expense'), ('Groceries', 'expense'), ('Transport', 'expense'),
    ('Shopping', 'expense'), ('Bills & Utilities', 'expense'), ('Entertainment', 'expense'),
    ('Health', 'expense'), ('Other', 'expense'),
    ('Salary', 'income'), ('Freelance', 'income'), ('Gift', 'income'),
    ('Refund', 'income'), ('Investment', 'income'), ('Other', 'income')
  ) as c(name, type)
  on conflict (user_id, type, name) do nothing;

  return new;
end;
$$;

-- Backfill defaults for users who already existed before this migration.
insert into public.categories (user_id, name, type)
select p.id, c.name, c.type
from public.profiles p
cross join (values
  ('Food & Dining', 'expense'), ('Groceries', 'expense'), ('Transport', 'expense'),
  ('Shopping', 'expense'), ('Bills & Utilities', 'expense'), ('Entertainment', 'expense'),
  ('Health', 'expense'), ('Other', 'expense'),
  ('Salary', 'income'), ('Freelance', 'income'), ('Gift', 'income'),
  ('Refund', 'income'), ('Investment', 'income'), ('Other', 'income')
) as c(name, type)
on conflict (user_id, type, name) do nothing;
