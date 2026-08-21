-- One-off seed script — NOT a schema migration, do not add it to the
-- numbered migrations sequence or run it via `supabase db push`.
--
-- Backfills ~12 months of synthetic transactions so the "All time" activity
-- heatmap on the Dashboard has enough data to preview properly. Every row
-- is tagged with a "[Seed] " merchant prefix so it's trivial to find and
-- remove afterward:
--   delete from public.transactions where merchant like '[Seed]%';
--
-- Run with (this queries your LIVE linked Supabase project):
--   npx supabase db query -f supabase/seed_test_data.sql --linked
--
-- Adjust the email filter below if this isn't the account you want seeded.
do $$
declare
  target_user uuid;
  expense_categories text[] := array['Groceries','Dining','Transport','Entertainment','Bills','Shopping','Health'];
  income_categories text[] := array['Salary','Freelance'];
  d date;
  txn_count int;
  i int;
  is_income boolean;
begin
  select id into target_user
  from public.profiles
  where email = 'alexberre97@gmail.com';

  if target_user is null then
    raise exception 'No profile found for that email — edit the email filter in this script.';
  end if;

  for d in select generate_series(current_date - interval '365 days', current_date, interval '1 day')::date loop
    -- Busier on weekdays, occasional zero-activity days, like real spending.
    txn_count := case
      when extract(dow from d) in (0, 6) then floor(random() * 2)::int
      else floor(random() * 4)::int
    end;

    for i in 1..txn_count loop
      is_income := random() < 0.1;
      insert into public.transactions (user_id, amount, type, category, date, merchant)
      values (
        target_user,
        round((case when is_income then 200 + random() * 2000 else 5 + random() * 150 end)::numeric, 2),
        case when is_income then 'income' else 'expense' end,
        case when is_income
          then income_categories[1 + floor(random() * array_length(income_categories, 1))::int]
          else expense_categories[1 + floor(random() * array_length(expense_categories, 1))::int]
        end,
        d + (random() * interval '20 hours'),
        '[Seed] ' || (case when is_income then 'Test income' else 'Test expense' end)
      );
    end loop;
  end loop;
end $$;
