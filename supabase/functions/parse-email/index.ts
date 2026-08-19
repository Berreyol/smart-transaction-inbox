// ============================================================================
// supabase/functions/parse-email/index.ts
//
// Receives Postmark's "Inbound Webhook" POST when a user forwards a bank
// email to our catch-all inbound address. Matches the sender to a user,
// extracts transaction details with regex, stores a pending_transactions
// row, and pushes an Expo notification asking the user to review it.
//
// Deploy:  supabase functions deploy parse-email --no-verify-jwt
// (--no-verify-jwt because Postmark, not a logged-in Supabase user, calls
// this endpoint. Auth is instead enforced via WEBHOOK_TOKEN below.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseTransactionEmail } from "./parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret configured as a query param on the Postmark inbound webhook
// URL (e.g. https://<project>.functions.supabase.co/parse-email?token=xxx),
// so only Postmark can trigger this function. Set with:
//   supabase secrets set WEBHOOK_TOKEN=xxx
const WEBHOOK_TOKEN = Deno.env.get("WEBHOOK_TOKEN");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// service_role client: bypasses RLS, required to read profiles by email and
// insert into pending_transactions on the user's behalf.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ----------------------------------------------------------------------------
// Postmark inbound payload (subset of fields we actually use).
// Full schema: https://postmarkapp.com/developer/webhooks/inbound-webhook
// ----------------------------------------------------------------------------
interface PostmarkInboundPayload {
  From: string; // raw "From" header, e.g. "Jane Doe <jane@gmail.com>"
  FromFull?: { Email: string; Name?: string };
  TextBody?: string;
  HtmlBody?: string;
  Subject?: string;
}

/** Extracts a bare email address out of a "Name <email>" style header. */
function extractEmail(from: string): string {
  const angleMatch = from.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? from).trim().toLowerCase();
}

/** Strips HTML tags down to plain text as a fallback when TextBody is absent. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendExpoPushNotification(pushToken: string, body: string) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title: "New transaction detected!",
        body,
        data: { screen: "Inbox" },
      }),
    });
    if (!res.ok) {
      console.error("Expo push request failed:", res.status, await res.text());
    }
  } catch (err) {
    // A failed push notification should never fail the whole webhook —
    // the transaction is already safely stored and reviewable in-app.
    console.error("Expo push error:", err);
  }
}

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

  let payload: PostmarkInboundPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const senderEmail = payload.FromFull?.Email?.toLowerCase() ?? extractEmail(payload.From ?? "");
  const rawText = payload.TextBody?.trim() || htmlToText(payload.HtmlBody ?? "");

  if (!senderEmail || !rawText) {
    return new Response("Missing sender or body", { status: 400 });
  }

  // 1. Identify the user by matching the forwarding address to a profile.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, expo_push_token")
    .ilike("email", senderEmail)
    .maybeSingle();

  if (profileError) {
    console.error("Error looking up profile:", profileError);
    return new Response("Internal error", { status: 500 });
  }

  if (!profile) {
    // No matching user — silently accept so Postmark doesn't retry forever,
    // but do nothing further. Nothing to notify, nothing to store.
    console.warn(`No profile found for forwarding address: ${senderEmail}`);
    return new Response("OK (no matching user)", { status: 200 });
  }

  // 2. Extract amount / type / merchant from the email body via regex.
  const parsed = parseTransactionEmail(rawText);

  // 3. Store as a pending transaction awaiting user approval.
  const { error: insertError } = await supabase.from("pending_transactions").insert({
    user_id: profile.id,
    amount: parsed.amount,
    type: parsed.type,
    merchant: parsed.merchant,
    raw_text: rawText.slice(0, 5000), // guard against pathologically large bodies
    status: "pending",
  });

  if (insertError) {
    console.error("Error inserting pending transaction:", insertError);
    return new Response("Internal error", { status: 500 });
  }

  // 4. Notify the user's device, if we have a push token on file.
  if (profile.expo_push_token) {
    const amountLabel = parsed.amount ? ` ($${parsed.amount.toFixed(2)})` : "";
    await sendExpoPushNotification(
      profile.expo_push_token,
      `New transaction detected${amountLabel}! Tap to review.`,
    );
  }

  return new Response("OK", { status: 200 });
});
