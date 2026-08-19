-- ============================================================================
-- forwarding_token: a per-user identifier embedded in the address a user
-- forwards bank mail to (as a "+tag", e.g. base+<token>@pipedream.net),
-- used to identify the user instead of trusting the email's From header.
--
-- From-header matching breaks for automated forwarding: a mail client's
-- "Forward" button rewrites From to the forwarder's own address (works
-- today), but an auto-forward *filter rule* often preserves the original
-- sender's From (the bank), which never matches a profile. The `to` address
-- survives forwarding either way and is under the user's control, so it's
-- the more reliable identifier — see parse-email/index.ts, which now tries
-- the token from `to` first and falls back to matching `from` by email.
--
-- Volatile default (gen_random_uuid() isn't constant) means Postgres
-- computes a distinct token per existing row when this column is added,
-- not just one shared value — every current profile gets backfilled.
-- ============================================================================
alter table public.profiles
  add column forwarding_token text not null unique
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
