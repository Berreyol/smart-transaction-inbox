# CLAUDE.md

Guidance for Claude Code (or any future agent) working in this repository. See `README.md` for user-facing setup and architecture; this file is about conventions, gotchas, and how to verify changes.

## What this is

A React Native (Expo) + Supabase app. Users forward bank notification emails to a personalized address (a `+tag` on one global Pipedream inbound address, keyed by each profile's `forwarding_token`); a step in that Pipedream workflow POSTs the parsed email to a Supabase Edge Function, which regex-parses the body, identifies the user by that token (falling back to matching the `From` header by email), and drops a row into `pending_transactions` for in-app approval. Full flow is diagrammed in `README.md` — read that first for the "why," this file is the "how to work in the code."

## Two runtimes, one repo

This repo has **two separate TypeScript environments that must not be conflated**:

- `/App.tsx`, `/index.ts`, `/src/**` — React Native app, Node/Metro tooling, checked by the root `tsconfig.json`.
- `/supabase/functions/**` — Deno edge functions. `tsconfig.json` explicitly excludes `supabase/functions`; there's a separate `supabase/functions/deno.json` for editor support. Don't try to make `tsc --noEmit` at the root cover the edge function — it can't (`Deno` global, `https://esm.sh/...` imports, no `npm` node_modules resolution).

## Verifying changes

- App code: `npx tsc --noEmit` (from repo root) and `npx expo-doctor`. Both should be clean before considering app-side work done.
- If you add a native module, use `npx expo install <pkg>` (not plain `npm install`) — it pins the SDK-57-compatible version and applies any config plugin wiring automatically (check `git diff app.json` after).
- Edge function: no local Deno test harness is set up. Sanity-check `supabase/functions/parse-email/parser.ts` logic with plain Node (it's dependency-free, pure regex — copy the functions into a scratch `.mjs` file and run sample strings through it) rather than trying to run the Deno handler locally.
- A Metro bundle smoke test (`npx expo export --platform ios --output-dir <scratch-dir>`) is a good way to catch import/native-module errors that `tsc` won't — it needs a `.env` with dummy `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` values present (the client throws early if they're missing). Delete the exported output and any `.env` you created for the test afterward — don't commit either.

## The `Database` type gotcha (already fixed, don't reintroduce)

`src/types/database.ts` defines the hand-written schema type passed to `createClient<Database>(...)`. Two non-obvious requirements, both already satisfied in the current file — if you touch this file, keep them:

1. **Row/Insert/Update types must be `type` aliases, not `interface`s.** `@supabase/postgrest-js` resolves table generics through deeply recursive conditional types. Interfaces aren't eagerly flattened the way type aliases are before that resolution runs, and the mismatch silently degrades every `.insert()`/`.update()`/`.select()` call's argument type to `never` — with an error that points at the *call site*, not at the type definition, making it genuinely confusing to debug. This was root-caused by bisection in this project; see the git history / prior session for the full trail if it resurfaces.
2. **`public` schema needs `Tables`, `Views`, `Functions`, `Enums`, `CompositeTypes` all present**, even if empty (`Record<string, never>`). Supabase's internal `GenericSchema` constraint requires all of them; omitting any one produces the same `never`-collapse failure mode as above.

If a new Supabase query starts complaining that some plainly-correct object "is not assignable to parameter of type `never`," check this file before assuming the query itself is wrong.

## RLS / security model — don't loosen without thinking it through

- `pending_transactions` has **no client-facing INSERT policy** on purpose. Only the edge function (via `service_role`, which bypasses RLS) creates these rows. If a feature seems to need the app to insert directly into `pending_transactions`, that's a sign the feature should go through a new edge function or RPC instead — don't add an insert policy as a shortcut.
- The `approve_pending_transaction` RPC (`supabase/migrations/0002_...sql`) is `SECURITY INVOKER`, not `SECURITY DEFINER` — it runs as the calling user and is subject to normal RLS. Keep it that way; there's no reason for this specific operation to need elevated privileges, and switching to `SECURITY DEFINER` would need its own `auth.uid()` re-validation to stay safe.
- The app's `.env` must only ever hold the Supabase **anon** key. `EXPO_PUBLIC_*` vars are inlined into the client JS bundle at build time — the `service_role` key must never carry that prefix or appear anywhere under `/src`.

## Conventions in this codebase

- State: Zustand stores under `src/store/`, one per domain (`authStore`, `inboxStore`, `transactionsStore`). Stores own their own Supabase calls; screens don't call `supabase` directly.
- No prop-drilling of the session — screens read `useAuthStore((s) => s.session)` directly.
- Comments are reserved for non-obvious "why" (a constraint, a workaround, a gotcha) — not restating what the code does. Match this when editing.
- SQL migrations are numbered and additive (`0001_`, `0002_`, ...) — never edit an already-applied migration; add a new one.

## Current status / roadmap

All six steps of the original build plan are done: SQL schema + RLS, the `parse-email` edge function, Expo app scaffold, push notification registration, the Inbox (approve/reject) screen, and the Dashboard (transaction list + income/expense `BarChart` via `react-native-gifted-charts`, in `src/components/IncomeExpenseChart.tsx`). See the "Status" section in `README.md` for the authoritative up-to-date state and likely next-round product work (date-range filtering, manual entry for unparseable emails, etc.).
