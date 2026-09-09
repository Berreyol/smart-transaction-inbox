# Smart Transaction Inbox

A personal finance app that turns forwarded bank emails into reviewable transactions — no bank API integrations, no OAuth. You forward a bank notification email, it shows up in an in-app inbox as a pending transaction, you approve or reject it.

## How it works (Method B: Sender Matching)

Every user forwards their bank emails to **one global inbound address**, personalized with a per-user `+tag` (e.g. `inbox+ab12cd34ef56@yourdomain.com` — shown in-app via the "@" header button). A [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) catch-all rule sends inbound mail on that address to a Cloudflare Worker (`cloudflare/email-worker/`), which parses the raw MIME email and POSTs it as JSON to a Supabase Edge Function. The function figures out *which user* the email belongs to by matching that `+tag` (each profile's `forwarding_token`) against a `profiles` table, falling back to the email's `From` address if no tag is present — not by parsing bank-specific templates or integrating with each bank individually.

```
┌──────────┐   forwards bank email   ┌────────────┐   parses MIME,      ┌────────────────────┐
│   User   │ ───────────────────────▶│ Cloudflare │───POSTs JSON───────▶│  Edge Function      │
│  (bank   │                         │ (Email     │                     │  parse-email        │
│  email)  │                         │  Worker)   │                     │                      │
└──────────┘                         └────────────┘                     │ 1. to+tag → profiles │
                                                                         │ 2. regex → amount/    │
                                                                         │    type/merchant      │
                                                                         │ 3. insert pending_    │
                                                                         │    transactions       │
                                                                         │    (service_role)     │
                                                                         │ 4. Expo push          │
                                                                         └──────────┬───────────┘
                                                                                  │
                                                                                  ▼
                                                                     ┌────────────────────────┐
                                                                     │   React Native App      │
                                                                     │   Inbox screen           │
                                                                     │   (Realtime subscription)│
                                                                     │                          │
                                                                     │  Approve ──▶ RPC:        │
                                                                     │   approve_pending_       │
                                                                     │   transaction (atomic:   │
                                                                     │   insert transactions +  │
                                                                     │   delete pending)        │
                                                                     │                          │
                                                                     │  Reject ──▶ delete        │
                                                                     │   pending_transactions   │
                                                                     └────────────────────────┘
```

### Why Cloudflare Email Routing + a Worker, not Pipedream

This used to be Pipedream (Email trigger → HTTP request step) — same shape, different transport. Pipedream's free plan caps usage at 100 credits/month and bills roughly 1 credit per email received, which scales with how much mail the app processes rather than with development effort; solo testing alone was on pace to exceed the free tier in a single month, well before any real users forwarding real bank mail. Cloudflare Email Routing is free with no inbound volume cap, and Workers' free tier comfortably covers this app's likely volume. The Worker (`cloudflare/email-worker/`) is deliberately "dumb": it only parses the raw MIME email and reshapes it into the same JSON shape Pipedream used to produce, then POSTs it to the same edge function — none of the identification/parsing logic below changed.

### Why matching by a forwarding token, not just sender

The user's personalized forwarding address *is* their identity in this system — it's how the edge function knows whose inbox a parsed transaction belongs to. Each profile has a `forwarding_token` (`supabase/migrations/0006_forwarding_token.sql`); the app shows it as a `+tag` on the shared inbound address (the "@" header button), and the edge function looks for that tag in three places, in order: the `X-Forwarded-To` header, the `to` address, then falls back to matching `From` by email.

This is deliberately not just "match the `From` address" (the original design), nor just "read the `to` address" — different forwarding setups put the personalized address in different places:

- **Auto-forward filter rule** (Gmail's "Forwarding and POP/IMAP", the realistic setup for "automatic" tracking): routes to the personalized address at the SMTP level, but the message's own `To:` header typically still shows the *original* recipient — the actual destination only shows up in the `X-Forwarded-To` header the relay adds. `From` also stays as the bank's, so from-matching wouldn't work here either.
- **Manual "Forward"** in a mail client: no `X-Forwarded-To` header, but `to` correctly holds the personalized address (it's the real recipient of the new message), and `From` gets rewritten to the forwarder's own address — the `From`-matching fallback exists for this case, mainly for users who haven't set up a personalized address at all and just forward manually.

### Why an RPC for "approve", not two client calls

Approving a pending transaction is two writes: insert into `transactions`, delete from `pending_transactions`. Done as two separate calls from the client, a dropped connection between them could leave a duplicate (insert succeeded, delete didn't) or a stranded row. `approve_pending_transaction` (see `supabase/migrations/0002_approve_pending_transaction.sql`) wraps both in a single Postgres function call, making the move atomic. It runs `SECURITY INVOKER`, so it grants no extra privileges — it only makes an already-permitted two-step operation atomic.

### Why `pending_transactions` has no client INSERT policy

Anyone with the app's public publishable key can call the Supabase REST API directly. If regular users could `INSERT` into `pending_transactions`, they could plant fake transactions in *anyone's* inbox (RLS on insert only stops writing rows you don't own if you explicitly check `user_id = auth.uid()` in a `WITH CHECK`, but there's no scenario where a client should be creating these rows at all). So there is no insert policy for the `authenticated` role — only the edge function, running with the `service_role` key (which bypasses RLS entirely), can create pending rows.

## Tech stack

| Layer | Choice |
|---|---|
| Mobile app | React Native (Expo, TypeScript) |
| Navigation | React Navigation (bottom tabs) |
| State | Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Email parsing | Cloudflare Email Routing → Email Worker → Deno Edge Function |
| Push notifications | Expo Push API |
| Charts | react-native-gifted-charts |

## Project structure

```
.
├── App.tsx                          # Root: auth gate → AuthScreen or RootNavigator
├── src/
│   ├── lib/supabase.ts              # Supabase client singleton (publishable key, AsyncStorage session)
│   ├── store/
│   │   ├── authStore.ts             # Zustand: session, sign in/up/out
│   │   ├── inboxStore.ts            # Zustand: pending queue, approve/reject, Realtime subscribe
│   │   └── transactionsStore.ts     # Zustand: confirmed transactions, Realtime subscribe
│   ├── navigation/RootNavigator.tsx # Bottom tabs: Inbox, Dashboard
│   ├── screens/
│   │   ├── AuthScreen.tsx
│   │   ├── InboxScreen.tsx          # The Smart Transaction Inbox
│   │   └── DashboardScreen.tsx      # Transaction list + income/expense chart
│   ├── components/
│   │   ├── PendingTransactionCard.tsx
│   │   ├── CategoryModal.tsx
│   │   ├── TransactionListItem.tsx
│   │   └── IncomeExpenseChart.tsx
│   ├── utils/
│   │   ├── notifications.ts         # Expo push registration
│   │   └── categories.ts
│   └── types/database.ts            # Hand-written types mirroring the SQL schema
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql            # profiles, transactions, pending_transactions, RLS
│   │   └── 0002_approve_pending_transaction.sql
│   └── functions/
│       └── parse-email/
│           ├── index.ts             # Inbound-email webhook handler
│           ├── parser.ts            # Regex extraction (amount/type/merchant)
│           └── deno.json
├── cloudflare/
│   └── email-worker/                # Cloudflare Email Worker: raw MIME -> JSON -> POST to parse-email
│       ├── src/index.ts
│       ├── wrangler.toml
│       └── README.md                # Domain/Email Routing/deploy setup steps
└── .env.example
```

## Database schema

- **`profiles`** — `id` (= `auth.users.id`), `email`, `expo_push_token`. Auto-created on signup via a trigger, seeded with the signup email. The email here is also the address the edge function matches inbound mail against (case-insensitively).
- **`transactions`** — confirmed transactions: `amount`, `type` (`income`/`expense`), `category`, `date`, `merchant`.
- **`pending_transactions`** — the inbox queue: same shape as `transactions` plus `raw_text` (the full forwarded email body) and `status` (`pending`/`approved`/`rejected`). Amount/type can be `null` if the regex parser couldn't confidently extract them — the app disables Approve in that case.

All three tables have RLS enabled, scoped to `auth.uid() = user_id` (or `= id` for `profiles`). `pending_transactions` intentionally has no client `INSERT` policy — see above.

## Setup

### 1. Supabase project

```bash
# Link this repo to your Supabase project, then apply migrations:
supabase link --project-ref <your-project-ref>
supabase db push
```

### 2. Edge function secrets & deploy

```bash
# Shared secret the Cloudflare Worker must pass back on the webhook URL (?token=...)
supabase secrets set WEBHOOK_TOKEN=<random-string>

supabase functions deploy parse-email --no-verify-jwt
```

`--no-verify-jwt` is required because the Cloudflare Worker, not a logged-in Supabase user, calls this endpoint — auth is instead enforced via `WEBHOOK_TOKEN`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 3. Cloudflare Email Worker

Full step-by-step (domain setup, Email Routing rule, `wrangler` deploy) is in [`cloudflare/email-worker/README.md`](cloudflare/email-worker/README.md) — summary:

1. Put a domain's DNS on Cloudflare and enable **Email Routing** for it.
2. `cd cloudflare/email-worker && npm install && npx wrangler login`.
3. Point `wrangler.toml`'s `SUPABASE_PARSE_EMAIL_URL` at your project's `parse-email` function URL, then `npx wrangler secret put WEBHOOK_TOKEN` (same value as step 2 above).
4. `npm run deploy`.
5. In the Cloudflare dashboard, add a **catch-all** Email Routing rule that sends to this worker, and **enable subaddressing** (Email Routing → Settings) — the catch-all rule alone isn't enough for `local-part+<forwarding_token>@yourdomain.com` to actually reach it; subaddressing is what makes Cloudflare treat the `+tag` variant as matching the same rule as the plain address.

The edge function expects a plain JSON shape (`to`, `from` as bare address strings, `text`, `html`, a lowercased `headers` record) — see `PipedreamEmailEvent` in `supabase/functions/parse-email/index.ts`. The Worker (`cloudflare/email-worker/src/index.ts`) parses the raw MIME email with `postal-mime` and reshapes it into exactly that, so the edge function needed no changes for this transport.

### 4. App environment

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# (publishable key only — never put the service_role key in the app)
# optionally fill in EXPO_PUBLIC_INBOUND_EMAIL_ADDRESS (the address routed
# to the Cloudflare Worker in step 3) so the app can display each user's
# full personalized forwarding address instead of just their token
```

### 5. Push notifications

Push tokens require an EAS project:
```bash
eas init   # links this repo to an EAS project (projectId lives in app.config.ts's extra.eas.projectId)
```

**Push notifications don't work in Expo Go on SDK 53+.** Test with a development build:
```bash
eas build --profile development
# or
npx expo run:android
npx expo run:ios
```

### 6. Testing against a separate dev environment

Real production email traffic should stay confined to the production Supabase project — a "dev" backend is a place you intentionally break things (schema changes, resets), and real users' bank transaction data has no reason to live there. Don't fan the production worker out to both projects.

Instead, set up a fully parallel, second stack that only you (or whoever's testing) feeds:

1. Migrations and the `parse-email` deploy against the dev Supabase project are handled by the `deploy-dev` job in `.github/workflows/supabase-release.yml` (see below) rather than run by hand.
2. Deploy the **`dev` environment** of the Cloudflare Worker — a separate worker (`npx wrangler deploy --env dev` from `cloudflare/email-worker/`, see the `[env.dev]` section in its `wrangler.toml`) pointed at the dev project's function URL, with its own secret (`npx wrangler secret put WEBHOOK_TOKEN --env dev`, same value as the `DEV_WEBHOOK_TOKEN` GitHub secret below). Give it its own Email Routing rule (a specific address like `dev-inbox@yourdomain.com`, not the catch-all) so dev traffic never touches the production worker.
3. Sign up in the app (pointed at the dev project) to get a dev `forwarding_token`, then forward real bank emails to `dev-inbox+<your-dev-token>@yourdomain.com` whenever you want to exercise the parser/pipeline end-to-end with real-shaped data — this generates real parsing, just gated to traffic you produce yourself rather than mirroring every user.

For quick iteration on parser changes alone, skip the Worker entirely and `curl` a saved sample payload straight at the dev function URL — or use `scripts/seed-pending-transaction.mjs`, which does exactly that with a few built-in scenarios (unparseable, fully-parseable, partially-parseable) so the Inbox always has realistic pending rows to test against. Needs `TEST_WEBHOOK_TOKEN` and `TEST_USER_FORWARDING_TOKEN` in `.env` (see `.env.example` and the script's header comment) — both unprefixed so they never reach the app bundle. Refuses to run if `EXPO_PUBLIC_SUPABASE_URL` points at production.

**Pushing migrations + the function to dev from a feature branch**: the `deploy-dev` job in `supabase-release.yml` runs on manual dispatch (`target: dev`, the default) against whatever branch/ref you pick — no PR needed:

```bash
gh workflow run supabase-release.yml --ref feature/your-branch -f target=dev
```

It links the dev project, sets the `WEBHOOK_TOKEN` secret on it from the `DEV_WEBHOOK_TOKEN` GitHub Actions secret, pushes migrations, and deploys `parse-email`. One-time setup: add a `DEV_WEBHOOK_TOKEN` secret to the `supabase-dev` GitHub environment (Settings → Environments → `supabase-dev` → Secrets) with the same value you want the dev Cloudflare Worker to pass as `?token=...`.

**Pointing an EAS build at the right backend**: EAS cloud builds don't upload gitignored files, so `.env` alone won't reach a cloud build — `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` need to be registered as EAS environment variables instead of (or in addition to) `.env`. `eas.json`'s `development`/`preview` build profiles are linked to an EAS environment named `development`, and `production` to one named `production`, so the right project's credentials get injected automatically per profile:

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value <dev-project-url> --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <dev-publishable-key> --visibility plaintext
# repeat with --environment production and the prod project's values
```

**Installing dev and prod side by side on the same device**: `app.config.ts` (not a static `app.json`) branches `bundleIdentifier`/`package`/`name` on `process.env.APP_VARIANT`, which `eas.json`'s `development`/`preview` profiles set to `"development"`. That gives a `development`-profile build a distinct identifier (`com.berreyol.smarttransactioninbox.dev`, named "Smart Transaction Inbox (Dev)") from a prod-pointed build (`com.berreyol.smarttransactioninbox`) — installing one won't overwrite the other, so you can keep a stable prod app for daily use and a dev app for testing on the same phone. The dev variant's bundle/package ID needs registering as its own App ID with your Apple Developer / Google Play account the first time you build it.

For an installable (non-App-Store) build pointed at production — e.g. to use as your own daily-use app before ever submitting to the App Store — use the `internal-prod` profile rather than `production` (which defaults to `store` distribution, meant for TestFlight/App Store submission, not direct install):
```bash
eas build --profile internal-prod --platform ios
```

## Development

```bash
npm install
npm run start      # Metro bundler — press i/a for iOS/Android, or scan the QR in a dev build
npm run ios
npm run android
```

Type-check: `npx tsc --noEmit`
Project health check: `npx expo-doctor`

## Status

- [x] Database schema + RLS (`supabase/migrations/`)
- [x] `parse-email` edge function
- [x] Expo app scaffold, navigation, auth
- [x] Push notification registration
- [x] Inbox screen (approve/reject flow)
- [x] Dashboard screen (transaction list + income/expense chart)

All six build steps are complete. Remaining work is polish/product decisions rather than scaffolding — e.g. date-range filtering on the Dashboard, editable categories, manual transaction entry for emails the parser couldn't confidently read.
