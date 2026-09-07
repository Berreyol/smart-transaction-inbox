# Email worker

Replaces Pipedream's "Email trigger → HTTP request step" as the transport
that turns an inbound bank-notification email into a JSON POST at the
`parse-email` Supabase edge function. See the header comment in
[`src/index.ts`](src/index.ts) for why this replaced Pipedream (cost/scale,
not features — this Worker does strictly less than Pipedream's workflow did;
all parsing/identification logic still lives in the edge function).

This is its own npm project (own `package.json`, `node_modules`,
`tsconfig.json`) — it is **not** part of the root app's dependency tree or
`tsconfig.json`, the same way `supabase/functions` is its own Deno
environment. Don't run `npm install` for this from the repo root.

## One-time setup

### 1. Put a domain on Cloudflare

Email Routing requires a domain whose DNS is managed by Cloudflare (add the
domain as a zone in the Cloudflare dashboard and point its nameservers at
Cloudflare, if it isn't already). Any domain you own works — this doesn't
need to be the domain the app is branded under.

### 2. Enable Email Routing for that domain

Cloudflare dashboard → your domain → **Email** → **Email Routing** → Enable.
This provisions the necessary MX/TXT records automatically since DNS is on
Cloudflare.

### 3. Install dependencies and log in to Cloudflare

```bash
cd cloudflare/email-worker
npm install
npx wrangler login
```

### 4. Configure and set secrets

Edit `wrangler.toml`'s `SUPABASE_PARSE_EMAIL_URL` to point at your actual
Supabase project's `parse-email` function URL, then set the shared webhook
secret (same value as the Supabase side's `WEBHOOK_TOKEN`):

```bash
npx wrangler secret put WEBHOOK_TOKEN
```

### 5. Deploy the worker

```bash
npm run deploy
```

### 6. Point Email Routing at the worker

Cloudflare dashboard → your domain → **Email** → **Email Routing** →
**Routing rules** → add a **Catch-all address** rule with action **Send to a
Worker** → select `berry-cash-email-worker`. A catch-all is what makes this
equivalent to Pipedream's single inbound address: any address at the domain
— including any `local-part+token@yourdomain.com` — reaches this worker,
which is what lets each user's personalized `+forwarding_token` keep working
exactly as it did with Pipedream.

### 7. Point the app at the new address

Update `.env`'s `EXPO_PUBLIC_INBOUND_EMAIL_ADDRESS` to whatever address you
chose to advertise in-app, e.g. `inbox@yourdomain.com` — `buildForwardingAddress()`
(`src/utils/forwardingAddress.ts`) just inserts `+<token>` before the `@`, so
any address at the domain works, no app code changes needed.

## Local development

```bash
npm run dev
```

`wrangler dev` exposes a local `/cdn-cgi/handler/email` endpoint that
triggers the `email()` handler — POST a raw MIME email to it to test the
worker without needing a real inbound message:

```bash
curl -X POST http://localhost:8787/cdn-cgi/handler/email \
  --data-binary @path/to/sample-email.eml \
  -H "Content-Type: message/rfc822"
```

## Typecheck

```bash
npm run typecheck
```

## Debugging a deployed worker

```bash
npm run tail
```

Streams live logs — useful since a failed parse or a failed POST to
`parse-email` is only ever logged (see the comment in `src/index.ts` on why
this worker never calls `message.setReject()`), not surfaced anywhere else.

This worker always POSTs to `parse-email` regardless of email type — the
dispatch between a bank transaction email and Gmail's forwarding-confirmation
notice happens inside `parse-email` itself (see that function's header
comment), not here, so this worker never needed to know the difference.
