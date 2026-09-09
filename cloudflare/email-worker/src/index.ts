// ============================================================================
// Cloudflare Email Worker — replaces Pipedream's "Email trigger -> HTTP
// request step" as the transport that turns an inbound email into a JSON
// POST at the Supabase edge function.
//
// Why this exists instead of Pipedream: Pipedream's free plan caps usage at
// 100 credits/month and bills roughly 1 credit per email received —
// solo testing alone was on pace to exceed that in a single month, well
// before any real users. Cloudflare Email Routing is free with no inbound
// volume cap, and Workers' free tier (100k requests/day) comfortably covers
// this at any scale this app is likely to reach. See docs/monetization-plan.md
// sibling discussion in the project history for the cost comparison that
// motivated this move.
//
// Deliberately dumb: this Worker's only job is "parse the raw MIME email,
// reshape it into the JSON shape parse-email already expects, POST it to one
// fixed URL." All identification/parsing/business logic stays server-side in
// the Deno edge function (unit-tested, single source of truth) rather than
// being duplicated or guessed at here — see supabase/functions/parse-email.
//
// The reshaped payload intentionally matches the `PipedreamEmailEvent` shape
// parse-email/index.ts already parses (plain-string `from`/`to`, a lowercase
// `headers` record) so that function needed zero changes for this migration.
// ============================================================================

import PostalMime from "postal-mime";

interface Env {
  /** Full URL of the parse-email edge function, e.g. https://<ref>.supabase.co/functions/v1/parse-email */
  SUPABASE_PARSE_EMAIL_URL: string;
  /** Shared secret matching the edge function's WEBHOOK_TOKEN. Set with `wrangler secret put WEBHOOK_TOKEN`. */
  WEBHOOK_TOKEN: string;
}

export default {
  // Not used by Email Routing (which invokes email() directly) — only here
  // so a stray HTTP request (a health check, `wrangler dev`'s own preview
  // ping, someone poking the deployed URL) gets a plain response instead of
  // the "Handler does not export a fetch() function" error a Worker with no
  // fetch() at all returns for any non-email request.
  fetch(): Response {
    return new Response("This worker only handles inbound email (Cloudflare Email Routing), not HTTP requests.", {
      status: 200,
    });
  },

  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      console.error("Failed to parse inbound email:", err);
      return;
    }

    const headers: Record<string, string> = {};
    for (const h of parsed.headers) {
      headers[h.key.toLowerCase()] = h.value;
    }

    // `message.to` is the SMTP envelope RCPT TO address — the exact address
    // this message was routed to under the Email Routing catch-all rule,
    // including any "+token" tag. Unlike under the old Pipedream setup,
    // where an auto-forward filter rule and a manual "Forward" put the
    // personalized address in different places (the message's own `To:`
    // header vs an X-Forwarded-To header added by the relay), Cloudflare
    // Email Routing operates at the SMTP envelope level: `message.to` is the
    // literal RCPT TO in both cases, since Cloudflare is always the final
    // hop receiving the message directly. So it's unconditionally reliable
    // here — but parse-email itself only ever reads a token out of the
    // X-Forwarded-To *header* (see its getHeader() calls), never a plain
    // `to` field, so it has to be injected as that header rather than passed
    // as `to` for parse-email to actually pick it up. Verified against a
    // real dev-project call: a plain `to` field alone leaves parse-email
    // falling through to From-matching, which doesn't reliably identify the
    // user for the same reason a plain `to` header didn't under Pipedream.
    headers["x-forwarded-to"] = message.to;

    // `from` prefers the parsed MIME header (what a user actually forwarded
    // from) over the SMTP envelope sender, since that's what parse-email's
    // From-matching fallback expects to compare against `profiles.email`.
    const payload = {
      from: parsed.from?.address ?? message.from,
      to: message.to,
      subject: parsed.subject ?? "",
      text: parsed.text ?? "",
      html: parsed.html ?? "",
      headers,
    };

    const url = new URL(env.SUPABASE_PARSE_EMAIL_URL);
    url.searchParams.set("token", env.WEBHOOK_TOKEN);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.error(`parse-email webhook returned ${res.status}: ${await res.text()}`);
      }
    } catch (err) {
      // Deliberately not calling message.setReject() here: the SMTP sender
      // for a forwarded bank email is typically the bank or the user's own
      // mail provider, not a person who could act on a bounce — rejecting
      // would just generate a confusing bounce message with no one able to
      // retry, whereas logging (visible via `wrangler tail`) is actionable
      // for whoever's operating this worker.
      console.error("Failed to POST to parse-email:", err);
    }
  },
} satisfies ExportedHandler<Env>;
