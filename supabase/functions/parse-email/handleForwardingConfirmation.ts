// ============================================================================
// Handles Gmail's "confirm auto-forwarding" notice — the message Google
// sends the first time a user sets up auto-forwarding from their own Gmail
// to their personalized inbox address. This surfaces an in-app "Confirm"
// button (see ForwardingConfirmationBanner) that opens the link in a real
// browser for the user to tap through.
//
// This used to also attempt the confirmation server-side via a bare POST to
// the confirmation URL, treating any 2xx response as proof of success. That
// was a false-positive machine: a real browser click is a full navigation
// (cookies, Referer, sec-fetch-* headers all pointing back at the same URL —
// confirmed against a live network capture on 2026-09-09), and Google
// happily returns 200 for a POST missing all of that context without
// actually confirming anything. There's no header/cookie we can add from a
// Deno edge function that reproduces a genuine logged-in browser navigation,
// so treating res.ok as "confirmed" was unverifiable and, in practice, wrong
// — rows got marked auto_confirmed while forwarding was never actually
// confirmed, hiding the banner the user needed to see. Don't reintroduce a
// server-side fetch attempt here; always fall through to the manual banner.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseForwardingConfirmationEmail } from "./forwardingConfirmationParser.ts";
import { sendExpoPushNotification } from "./notifications.ts";
import type { ProfileRow } from "./identifyUser.ts";

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

  const { error: confirmationInsertError } = await supabase.from("forwarding_confirmations").insert({
    user_id: profile.id,
    source_email: confirmation.sourceEmail,
    confirmation_url: confirmation.confirmationUrl,
    status: "pending",
  });

  if (confirmationInsertError) {
    console.error("Error inserting forwarding confirmation:", confirmationInsertError);
    return new Response("Internal error", { status: 500 });
  }

  if (profile.expo_push_token) {
    await sendExpoPushNotification(
      profile.expo_push_token,
      "Action needed",
      "Tap to confirm your email forwarding setup.",
    );
  }

  return new Response("OK", { status: 200 });
}
