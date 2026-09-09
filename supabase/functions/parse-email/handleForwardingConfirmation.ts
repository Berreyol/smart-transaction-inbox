// ============================================================================
// Handles Gmail's "confirm auto-forwarding" notice — the message Google
// sends the first time a user sets up auto-forwarding from their own Gmail
// to their personalized inbox address. Historically this required manually
// opening that email and clicking the link for every new user; this instead
// attempts the confirmation server-side, falling back to surfacing an
// in-app "Confirm" button (see ForwardingConfirmationBanner) when the
// automatic attempt doesn't succeed.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseForwardingConfirmationEmail } from "./forwardingConfirmationParser.ts";
import { sendExpoPushNotification } from "./notifications.ts";
import type { ProfileRow } from "./identifyUser.ts";

/**
 * GETs an already-verified-genuine (see isGenuineGoogleForwardingConfirmationUrl
 * in forwardingConfirmationParser.ts) Gmail forwarding confirmation
 * URL. That confirmation is a stateless bearer link — possession of it is
 * the proof of control over the destination address, no login/session
 * required — so a plain server-side GET completes it exactly as a browser
 * click would.
 */
async function attemptAutoConfirmForwarding(url: string): Promise<{ ok: boolean; error: string | null }> {
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

/**
 * Returns null when `rawText` isn't a forwarding-confirmation email, so the
 * caller falls through to transaction parsing instead. This is the only
 * caller of parseForwardingConfirmationEmail, which is the single safety
 * gate for this whole branch — it returns null for anything that doesn't
 * contain a URL genuinely hosted on mail.google.com, regardless of how
 * convincing the surrounding text looks (see its own comments and
 * forwardingConfirmationParser.ts's header for the full
 * SSRF/phishing threat model this closes off).
 */
export async function handleForwardingConfirmation(
  supabase: SupabaseClient,
  rawText: string,
  profile: ProfileRow,
): Promise<Response | null> {
  const confirmation = parseForwardingConfirmationEmail(rawText);
  if (!confirmation) return null;

  const confirmResult = await attemptAutoConfirmForwarding(confirmation.confirmationUrl);

  const { error: confirmationInsertError } = await supabase.from("forwarding_confirmations").insert({
    user_id: profile.id,
    source_email: confirmation.sourceEmail,
    confirmation_url: confirmation.confirmationUrl,
    status: confirmResult.ok ? "auto_confirmed" : "pending",
    auto_confirm_error: confirmResult.error,
  });

  if (confirmationInsertError) {
    console.error("Error inserting forwarding confirmation:", confirmationInsertError);
    return new Response("Internal error", { status: 500 });
  }

  if (profile.expo_push_token) {
    await sendExpoPushNotification(
      profile.expo_push_token,
      confirmResult.ok ? "Forwarding confirmed" : "Action needed",
      confirmResult.ok
        ? "Your bank email forwarding is set up and ready to go."
        : "Tap to confirm your email forwarding setup.",
    );
  }

  return new Response("OK", { status: 200 });
}
