-- ============================================================================
-- Set REPLICA IDENTITY FULL on the two realtime-subscribed tables.
--
-- Both inboxStore.ts and transactionsStore.ts subscribe with a
-- `filter: user_id=eq.<id>` clause. With the default REPLICA IDENTITY
-- (primary key only), a DELETE's old-row image in the WAL contains just
-- `id` — no `user_id` — so Realtime can't evaluate the filter and silently
-- drops the event. INSERT/UPDATE aren't affected (the new row always has
-- every column), which is why approvals showed up live but deletes
-- (rejects, or any row removed from outside the current session) didn't.
-- ============================================================================
alter table public.pending_transactions replica identity full;
alter table public.transactions replica identity full;
