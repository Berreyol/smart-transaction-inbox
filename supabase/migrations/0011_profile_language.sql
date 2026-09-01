-- ============================================================================
-- language: the user's preferred display language for the app UI ("en" or
-- "es"). Nullable — null means "no explicit preference yet," in which case
-- the client falls back to the device locale. Purely a UI concern: the
-- parse-email edge function's regex parsing is language-independent and
-- never reads this column.
-- ============================================================================
alter table public.profiles
  add column language text;
