-- ============================================================================
-- Lets a new user's chosen language (picked on the sign-up screen, sent as
-- auth.users' raw_user_meta_data->>'language' via supabase.auth.signUp's
-- `options.data`) land directly on the profiles row the handle_new_user
-- trigger creates, instead of requiring a second authenticated UPDATE right
-- after signUp — which would be unreliable when email confirmation is on
-- and no session exists yet. Absent/unrecognized metadata just yields null,
-- same as never having picked a language (falls back to device locale).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, language)
  values (new.id, new.email, new.raw_user_meta_data->>'language')
  on conflict (id) do nothing;
  return new;
end;
$$;
