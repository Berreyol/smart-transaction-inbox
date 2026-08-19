# Smart Transaction Inbox

A personal finance app that turns forwarded bank emails into reviewable transactions — no bank API integrations, no OAuth. You forward a bank notification email, it shows up in an in-app inbox as a pending transaction, you approve or reject it.

## How it works (Method B: Sender Matching)

Every user forwards their bank emails to **one global inbound address**. [Postmark](https://postmarkapp.com) catches inbound mail on that address and POSTs a JSON webhook to a Supabase Edge Function. The function figures out *which user* the email belongs to by matching the email's `From` address against a `profiles` table — not by parsing bank-specific templates or integrating with each bank individually.

```
┌──────────┐   forwards bank email   ┌──────────┐   inbound webhook   ┌────────────────────┐
│   User   │ ───────────────────────▶│ Postmark │────────────────────▶│  Edge Function      │
│  (bank   │                         │ (inbound │                     │  parse-email        │
│  email)  │                         │ parsing) │                     │                      │
└──────────┘                         └──────────┘                     │ 1. From → profiles   │
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

### Why matching by sender, not parsing bank identity

The user's forwarding email address *is* their identity in this system — it's how the edge function knows whose inbox a parsed transaction belongs to. That's why sign-up email and the address you forward bank mail *from* must be the same address.

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
| Email parsing | Postmark inbound webhook → Deno Edge Function |
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
│           ├── index.ts             # Postmark webhook handler
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
# Shared secret Postmark must pass back on the webhook URL (?token=...)
supabase secrets set WEBHOOK_TOKEN=<random-string>

supabase functions deploy parse-email --no-verify-jwt
```

`--no-verify-jwt` is required because Postmark, not a logged-in Supabase user, calls this endpoint — auth is instead enforced via `WEBHOOK_TOKEN`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 3. Postmark inbound webhook

Point your Postmark inbound stream's webhook URL at:
```
https://<project-ref>.functions.supabase.co/parse-email?token=<the WEBHOOK_TOKEN you set>
```

### 4. App environment

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# (anon key only — never put the service_role key in the app)
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
