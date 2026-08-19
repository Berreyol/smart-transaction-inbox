# Smart Transaction Inbox

A personal finance app that turns forwarded bank emails into reviewable transactions — no bank API integrations, no OAuth. You forward a bank notification email, it shows up in an in-app inbox as a pending transaction, you approve or reject it.

## How it works (Method B: Sender Matching)

Every user forwards their bank emails to **one global inbound address**, personalized with a per-user `+tag` (e.g. `base+ab12cd34ef56@pipedream.net` — shown in-app via the "@" header button). [Pipedream](https://pipedream.com)'s Email trigger catches inbound mail on that address, parses it, and a workflow step POSTs the parsed email as JSON to a Supabase Edge Function. The function figures out *which user* the email belongs to by matching that `+tag` (each profile's `forwarding_token`) against a `profiles` table, falling back to the email's `From` address if no tag is present — not by parsing bank-specific templates or integrating with each bank individually.

```
┌──────────┐   forwards bank email   ┌──────────┐   HTTP POST step    ┌────────────────────┐
│   User   │ ───────────────────────▶│Pipedream │────────────────────▶│  Edge Function      │
│  (bank   │                         │ (Email   │                     │  parse-email        │
│  email)  │                         │ trigger) │                     │                      │
└──────────┘                         └──────────┘                     │ 1. to+tag → profiles │
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

### Why matching by a forwarding token, not just sender

The user's personalized forwarding address *is* their identity in this system — it's how the edge function knows whose inbox a parsed transaction belongs to. Each profile has a `forwarding_token` (`supabase/migrations/0006_forwarding_token.sql`); the app shows it as a `+tag` on the shared Pipedream address (the "@" header button), and the edge function looks for that tag in three places, in order: the `X-Forwarded-To` header, the `to` address, then falls back to matching `From` by email.

This is deliberately not just "match the `From` address" (the original design), nor just "read the `to` address" — different forwarding setups put the personalized address in different places:

- **Auto-forward filter rule** (Gmail's "Forwarding and POP/IMAP", the realistic setup for "automatic" tracking): routes to the personalized address at the SMTP level, but the message's own `To:` header typically still shows the *original* recipient — the actual destination only shows up in the `X-Forwarded-To` header the relay adds. `From` also stays as the bank's, so from-matching wouldn't work here either.
- **Manual "Forward"** in a mail client: no `X-Forwarded-To` header, but `to` correctly holds the personalized address (it's the real recipient of the new message), and `From` gets rewritten to the forwarder's own address — the `From`-matching fallback exists for this case, mainly for users who haven't set up a personalized address at all and just forward manually.

### Why an RPC for "approve", not two client calls

Approving a pending transaction is two writes: insert into `transactions`, delete from `pending_transactions`. Done as two separate calls from the client, a dropped connection between them could leave a duplicate (insert succeeded, delete didn't) or a stranded row. `approve_pending_transaction` (see `supabase/migrations/0002_approve_pending_transaction.sql`) wraps both in a single Postgres function call, making the move atomic. It runs `SECURITY INVOKER`, so it grants no extra privileges — it only makes an already-permitted two-step operation atomic.

### Why `pending_transactions` has no client INSERT policy

Anyone with the app's public anon key can call the Supabase REST API directly. If regular users could `INSERT` into `pending_transactions`, they could plant fake transactions in *anyone's* inbox (RLS on insert only stops writing rows you don't own if you explicitly check `user_id = auth.uid()` in a `WITH CHECK`, but there's no scenario where a client should be creating these rows at all). So there is no insert policy for the `authenticated` role — only the edge function, running with the `service_role` key (which bypasses RLS entirely), can create pending rows.

## Tech stack

| Layer | Choice |
|---|---|
| Mobile app | React Native (Expo, TypeScript) |
| Navigation | React Navigation (bottom tabs) |
| State | Zustand |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Email parsing | Pipedream Email trigger → HTTP step → Deno Edge Function |
| Push notifications | Expo Push API |
| Charts | react-native-gifted-charts |

## Project structure

```
.
├── App.tsx                          # Root: auth gate → AuthScreen or RootNavigator
├── src/
│   ├── lib/supabase.ts              # Supabase client singleton (anon key, AsyncStorage session)
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
│           ├── index.ts             # Pipedream webhook handler
│           ├── parser.ts            # Regex extraction (amount/type/merchant)
│           └── deno.json
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
# Shared secret the Pipedream workflow must pass back on the webhook URL (?token=...)
supabase secrets set WEBHOOK_TOKEN=<random-string>

supabase functions deploy parse-email --no-verify-jwt
```

`--no-verify-jwt` is required because Pipedream, not a logged-in Supabase user, calls this endpoint — auth is instead enforced via `WEBHOOK_TOKEN`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 3. Pipedream workflow

1. Create a new Pipedream workflow with trigger type **Email**. Pipedream mints a unique inbound address for the workflow — that's the *base* address; each user forwards to a personalized `base+<their forwarding_token>@...` variant of it (shown in-app via the "@" header button), which Pipedream still routes to the same workflow.
2. Add a step after the trigger — **"Send an HTTP request"** (or a Node.js code step using `fetch`) — that POSTs the trigger's parsed event as JSON to:
   ```
   https://<project-ref>.supabase.co/functions/v1/parse-email?token=<the WEBHOOK_TOKEN you set>
   ```
   Body: `{{steps.trigger.event}}` (the full mailparser-parsed email object — the edge function reads `to`, `from`, `text`, and `html` off it).
3. Deploy the workflow.

The edge function expects the raw mailparser shape Pipedream's Email trigger produces (`to.value[0].address`, `from.value[0].address`, `text`, `html`, plus `headers`/`headerLines` for `X-Forwarded-To`). If you reshape the payload in a code step before forwarding it, update `PipedreamEmailEvent` and the field access in `supabase/functions/parse-email/index.ts` to match.

### 4. App environment

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# (anon key only — never put the service_role key in the app)
# optionally fill in EXPO_PUBLIC_INBOUND_EMAIL_ADDRESS (the base Pipedream
# address from step 3) so the app can display each user's full personalized
# forwarding address instead of just their token
```

### 5. Push notifications

Push tokens require an EAS project:
```bash
eas init   # writes extra.eas.projectId into app.json
```

**Push notifications don't work in Expo Go on SDK 53+.** Test with a development build:
```bash
eas build --profile development
# or
npx expo run:android
npx expo run:ios
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
