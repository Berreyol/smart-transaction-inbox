// ============================================================================
// supabase/functions/handle-forwarding-confirmation/index.ts
//
// Receives a POST when Gmail's "confirm auto-forwarding" email lands in the
// shared inbound address — the message Google sends the first time a user
// sets up auto-forwarding from their own Gmail to their personalized
// inbox+<forwarding_token>@yourdomain.com address. Historically this
// required the developer to manually open that email and click the
// confirmation link for every new user; this function automates that by
// attempting the confirmation server-side, and falls back to surfacing an
// in-app "Confirm" button (see ForwardingConfirmationBanner) when the
// automatic attempt doesn't succeed.
//
// SECURITY: the shared inbound address isn't secret, and email headers
// (From, Subject) are trivially spoofable — anyone can send this endpoint an
// email claiming to be Google's forwarding notice with an arbitrary URL
// embedded. The only thing we ever act on (fetch server-side, or hand to the
// client to render as a button) is a URL that survives
// isGenuineGoogleForwardingConfirmationUrl() in parser.ts, which checks the
// *parsed* hostname is exactly mail.google.com — not a substring match, so
// tricks like "mail.google.com.evil.com" don't pass. An attacker cannot
// forge a URL that is both attacker-controlled *and* genuinely hosted on
// mail.google.com, which closes off both SSRF (the auto-confirm fetch could
// otherwise be pointed at internal infrastructure/cloud metadata endpoints)
// and phishing (the in-app button could otherwise point users at malicious
// content with this app's trust behind it). Anything that doesn't produce a
// genuine URL is dropped silently — no row written, no fetch attempted.
//
// NOT YET WIRED UP: the Cloudflare Email Worker (cloudflare/email-worker/)
// currently POSTs every inbound email to parse-email alone — this function
// receives no traffic yet. The dispatch decision (which emails are Gmail's
// confirmation notice vs. a bank transaction email) is meant to live inside
// parse-email itself, which can try parseForwardingConfirmationEmail() first
// and fall through to its own transaction parsing otherwise, rather than
// being guessed at in the transport layer — see that function's future
// changes. Once wired up, this still reuses the same WEBHOOK_TOKEN secret.
//
// Deploy:  supabase functions deploy handle-forwarding-confirmation --no-verify-jwt
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseForwardingConfirmationEmail } from "./parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = Deno.env.get("WEBHOOK_TOKEN");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type MailAddressField = string | { value?: { address?: string; name?: string }[]; text?: string };

interface PipedreamEmailEvent {
  to?: MailAddressField;
  subject?: string;
  text?: string;
  html?: string;
  [header: string]: unknown;
}

function extractEmail(raw: string): string {
  const first = raw.split(",")[0] ?? raw;
  const angleMatch = first.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? first).trim().toLowerCase();
}

function extractAddress(field: MailAddressField | undefined): string {
  if (!field) return "";
  if (typeof field === "string") return extractEmail(field);
  return field.value?.[0]?.address?.toLowerCase() ?? extractEmail(field.text ?? "");
}

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

/** Extracts the "+tag" subaddress out of an email's local-part, e.g. "base+ab12cd@x.com" -> "ab12cd". */
function extractForwardingToken(address: string): string | null {
  const local = address.split("@")[0] ?? "";
  const plusIndex = local.indexOf("+");
  if (plusIndex === -1) return null;
  const token = local.slice(plusIndex + 1).trim();
  return token || null;
}

/**
 * GETs the (already-verified-genuine) confirmation URL. Gmail's forwarding
 * confirmation is a stateless bearer link — possession of it is the proof of
 * control over the destination address, no login/session required — so a
 * plain server-side GET completes it exactly as a browser click would.
 */
async function attemptAutoConfirm(url: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BerryCashForwardingConfirm/1.0; +https://github.com/Berreyol/smart-transaction-inbox)",
      },
    });
    if (res.ok) return { ok: true, error: null };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendExpoPushNotification(pushToken: string, title: string, body: string) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({ to: pushToken, sound: "default", title, body, data: { screen: "Inbox" } }),
    });
    if (!res.ok) {
      console.error("Expo push request failed:", res.status, await res.text());
    }
  } catch (err) {
    // A failed push notification should never fail the whole webhook.
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

  // The single safety gate for this whole function: parseForwardingConfirmationEmail
  // returns null for anything that doesn't contain a URL genuinely hosted on
  // mail.google.com, regardless of how convincing the surrounding text looks.
  const parsed = parseForwardingConfirmationEmail(rawText);
  if (!parsed) {
    console.warn("Not a genuine Gmail forwarding confirmation email — dropping.");
    return new Response("OK (not a forwarding confirmation)", { status: 200 });
  }

  // Identify the user. The `to` address is the most reliable source (it's
  // literally the address Gmail was told to confirm forwarding to), falling
  // back to the token embedded in the body text, then to matching the
  // requesting Gmail account against a profile's own email — same layered
  // strategy as parse-email/index.ts, for the same reason: forwarding
  // mechanisms disagree on what ends up where.
  const toToken = extractForwardingToken(extractAddress(payload.to));
  const forwardingToken = toToken ?? parsed.forwardingToken;

  type ProfileRow = { id: string; expo_push_token: string | null };
  let profile: ProfileRow | null = null;

  if (forwardingToken) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .eq("forwarding_token", forwardingToken)
      .maybeSingle();

    if (error) {
      console.error("Error looking up profile by forwarding token:", error);
      return new Response("Internal error", { status: 500 });
    }
    profile = data;
  }

  if (!profile && parsed.sourceEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .ilike("email", parsed.sourceEmail)
      .maybeSingle();

    if (error) {
      console.error("Error looking up profile by source email:", error);
      return new Response("Internal error", { status: 500 });
    }
    profile = data;
  }

  if (!profile) {
    console.warn(
      `No profile found for forwarding token "${forwardingToken}" or source email "${parsed.sourceEmail}"`,
    );
    return new Response("OK (no matching user)", { status: 200 });
  }

  const confirmResult = await attemptAutoConfirm(parsed.confirmationUrl);

  const { error: insertError } = await supabase.from("forwarding_confirmations").insert({
    user_id: profile.id,
    source_email: parsed.sourceEmail,
    confirmation_url: parsed.confirmationUrl,
    status: confirmResult.ok ? "auto_confirmed" : "pending",
    auto_confirm_error: confirmResult.error,
  });

  if (insertError) {
    console.error("Error inserting forwarding confirmation:", insertError);
    return new Response("Internal error", { status: 500 });
  }

  if (profile.expo_push_token) {
    if (confirmResult.ok) {
      await sendExpoPushNotification(
        profile.expo_push_token,
        "Forwarding confirmed",
        "Your bank email forwarding is set up and ready to go.",
      );
    } else {
      await sendExpoPushNotification(
        profile.expo_push_token,
        "Action needed",
        "Tap to confirm your email forwarding setup.",
      );
    }
  }

  return new Response("OK", { status: 200 });
});
