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
import type { ProfileMatchedBy, ProfileRow } from "./identifyUser.ts";

// Bounds how many forwarding_confirmations rows (and push notifications) one
// profile can accumulate per window. Legitimate use is 0-1 ever per profile
// (occasionally 2-3 if someone sets up forwarding from more than one Gmail
// account) — this is defense-in-depth against a leaked forwarding token
// being used to spam a real user with repeated fabricated "confirm
// forwarding" prompts, not a limit anyone should hit organically.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 5;

/**
 * Returns null when `rawText` isn't a forwarding-confirmation email (or when
 * it is, but the sender couldn't be verified — see matchedBy below), so the
 * caller falls through to transaction parsing instead. parseForwardingConfirmationEmail
 * is the safety gate against a spoofed *body* — it returns null for anything
 * that doesn't contain a URL genuinely hosted on mail.google.com, regardless
 * of how convincing the surrounding text looks (see its own comments and
 * forwardingConfirmationParser.ts's header for the full SSRF/phishing threat
 * model this closes off). That alone isn't a gate against a spoofed
 * *sender*, though: an attacker can't forge a URL on Google's own domain,
 * but they can trivially obtain a genuine one (set up real forwarding from
 * any throwaway Gmail account to any address, copy the link out of the
 * confirmation email Google sends) and paste it into a fabricated email
 * addressed at someone else's forwarding address. matchedBy is what closes
 * that gap.
 */
export async function handleForwardingConfirmation(
  supabase: SupabaseClient,
  rawText: string,
  profile: ProfileRow,
  matchedBy: ProfileMatchedBy,
): Promise<Response | null> {
  const confirmation = parseForwardingConfirmationEmail(rawText);
  if (!confirmation) return null;

  // Only trust a forwarding-confirmation email when the sender was
  // identified via their forwarding token, not the From-header fallback.
  // The From header is copied verbatim from the inbound MIME message with
  // no SPF/DKIM/DMARC check anywhere in this pipeline (see
  // cloudflare/email-worker/src/index.ts), so anyone who merely knows a
  // user's plain email address — not secret at all — could otherwise get
  // identified as them and trigger a fabricated confirmation prompt. The
  // token isn't spoofable the same way: it only ever reaches a profile
  // lookup by being the literal SMTP envelope recipient (see identifyUser.ts).
  // Falling through here means the email is handled like ordinary
  // unparseable mail rather than acted on.
  if (matchedBy !== "token") return null;

  // Dedup: Google can resend the same notice, and the transport can retry a
  // delivery — neither should create a second row or a second notification
  // for a link the user has already seen.
  const { data: existing, error: existingError } = await supabase
    .from("forwarding_confirmations")
    .select("id")
    .eq("user_id", profile.id)
    .eq("confirmation_url", confirmation.confirmationUrl)
    .maybeSingle();

  if (existingError) {
    console.error("Error checking for duplicate forwarding confirmation:", existingError);
    return new Response("Internal error", { status: 500 });
  }
  if (existing) {
    return new Response("OK (duplicate)", { status: 200 });
  }

  const rateLimitSince = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recentCount, error: countError } = await supabase
    .from("forwarding_confirmations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .gte("created_at", rateLimitSince);

  if (countError) {
    console.error("Error counting recent forwarding confirmations:", countError);
    return new Response("Internal error", { status: 500 });
  }
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_PER_WINDOW) {
    console.warn(`Forwarding confirmation rate limit hit for user ${profile.id}`);
    return new Response("OK (rate limited)", { status: 200 });
  }

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
