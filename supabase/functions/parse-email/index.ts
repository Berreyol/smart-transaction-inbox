// ============================================================================
// supabase/functions/parse-email/index.ts
//
// Receives a POST from the inbound-email transport (currently a Cloudflare
// Email Worker, cloudflare/email-worker/ — previously a Pipedream workflow,
// see that directory's README for why it moved) for every email a user's
// personalized address receives. That's two different kinds of email,
// dispatched after a shared identify-the-user step (identifyUser.ts):
//
//   1. A forwarded bank notification — see handleTransactionEmail.ts.
//   2. Gmail's "confirm auto-forwarding" email — see
//      handleForwardingConfirmation.ts.
//
// This dispatch deliberately lives here rather than in the transport layer
// (a Pipedream workflow branch, or guessing in the Cloudflare Worker) — see
// git history for supabase/functions/handle-forwarding-confirmation, a
// separate function this replaced: it was never actually deployed (the
// transport always posted everything here regardless), and a wrong guess at
// the transport layer risked silently dropping a real transaction email. For
// the same reason, don't split the two branches below into separate
// *deployed* functions either — one HTTP entry point that dispatches
// internally is the load-bearing part of this design, not an accident of
// how the code happens to be organized.
//
// Expected payload shape (PipedreamEmailEvent in payload.ts, name kept from
// this function's original transport): `to`/`from` as either a bare address
// string or a mailparser-style AddressObject, `text`/`html` bodies, and
// `headers` (a lowercase-keyed record) or `headerLines` for X-Forwarded-To.
// The Cloudflare Worker reshapes postal-mime's output into exactly this —
// see cloudflare/email-worker/src/index.ts — so this handler needed no
// changes when the transport moved off Pipedream.
//
// Auth: called by the Cloudflare Worker, not a logged-in Supabase user, so
// this is deployed with --no-verify-jwt and auth is instead enforced via
// the WEBHOOK_TOKEN query param below.
// Deploy:  supabase functions deploy parse-email --no-verify-jwt
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { identifyUser } from "./identifyUser.ts";
import { handleForwardingConfirmation } from "./handleForwardingConfirmation.ts";
import { handleTransactionEmail } from "./handleTransactionEmail.ts";
import { htmlToText } from "./payload.ts";
import type { PipedreamEmailEvent } from "./payload.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret configured as a query param on the URL the Cloudflare
// Worker POSTs to (e.g. https://<project-ref>.supabase.co/functions/v1/parse-email?token=xxx),
// so only that worker can trigger this function. Set with:
//   supabase secrets set WEBHOOK_TOKEN=xxx
const WEBHOOK_TOKEN = Deno.env.get("WEBHOOK_TOKEN");

// service_role client: bypasses RLS, required to read profiles by email and
// insert into pending_transactions/forwarding_confirmations on the user's
// behalf.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (WEBHOOK_TOKEN) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== WEBHOOK_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: PipedreamEmailEvent;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const htmlText = payload.html ? htmlToText(payload.html) : "";
  const rawText = payload.text?.trim() || htmlText;

  if (!rawText) {
    return new Response("Missing body", { status: 400 });
  }

  const identified = await identifyUser(supabase, payload);
  if (!identified.ok) {
    return new Response("Internal error", { status: 500 });
  }
  const { profile, forwardingToken, senderEmail, matchedBy } = identified;

  if (!forwardingToken && !senderEmail) {
    return new Response("Missing sender", { status: 400 });
  }

  if (!profile) {
    // No matching user — silently accept so the transport doesn't retry
    // forever, but do nothing further. Nothing to notify, nothing to store.
    console.warn(
      `No profile found for forwarding token "${forwardingToken}" or sender "${senderEmail}"`,
    );
    return new Response("OK (no matching user)", { status: 200 });
  }

  // Dispatch: handleForwardingConfirmation returns null for anything that
  // isn't Gmail's confirmation notice, in which case this falls through to
  // transaction parsing.
  const confirmationResponse = await handleForwardingConfirmation(supabase, rawText, profile, matchedBy);
  if (confirmationResponse) return confirmationResponse;

  return handleTransactionEmail(supabase, payload, profile, rawText, htmlText);
});
