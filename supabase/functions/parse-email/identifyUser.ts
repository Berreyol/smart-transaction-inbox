// ============================================================================
// Resolves an inbound email to the profile it belongs to. Every profile has
// a forwarding_token (see migration 0006), and the app shows each user a
// personalized address of the form inbox+<token>@yourdomain.com. We try that
// token first, read out of (in order) the X-Forwarded-To header, then the
// `to` address, then fall back to matching From by email. Three sources
// because forwarding mechanisms disagree on what ends up where: an
// auto-forward *filter rule* routes at the SMTP level to the personalized
// address but typically leaves the message's own To: header as the original
// recipient — the destination only shows up in X-Forwarded-To (added by the
// relay) — while a manual "Forward" doesn't add that header at all, but does
// put the personalized address in `to` (since it's the actual recipient of
// the new message) and rewrites From to the forwarder's own address, which
// is what the final fallback catches. (The Cloudflare Worker sets
// X-Forwarded-To from the SMTP envelope for every email, confirmation
// notices included, so this same lookup identifies the user regardless of
// which kind of email it turns out to be.)
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { extractAddress, extractEmail, extractForwardingToken, getHeader } from "./payload.ts";
import type { PipedreamEmailEvent } from "./payload.ts";

export type ProfileRow = { id: string; expo_push_token: string | null };

/**
 * Which lookup actually matched the profile. Distinct from `forwardingToken`
 * being non-null: `forwardingToken` can be present but match no profile,
 * falling through to the `from` match — callers that need to know the email
 * was identified via the unspoofable path (the token, not the
 * attacker-controlled From header) should check this rather than just
 * truthiness of `forwardingToken`. See handleForwardingConfirmation.ts.
 */
export type ProfileMatchedBy = "token" | "from" | null;

export type IdentifyUserResult =
  | {
      ok: true;
      profile: ProfileRow | null;
      forwardingToken: string | null;
      senderEmail: string;
      matchedBy: ProfileMatchedBy;
    }
  | { ok: false };

/**
 * Identifies which profile (if any) an inbound email belongs to. Returns
 * `ok: false` only on an actual DB error — a profile of `null` with `ok:
 * true` means the lookups ran fine but nobody matched.
 */
export async function identifyUser(
  supabase: SupabaseClient,
  payload: PipedreamEmailEvent,
): Promise<IdentifyUserResult> {
  const senderEmail = extractAddress(payload.from);
  const xForwardedTo = getHeader(payload, "x-forwarded-to");
  const forwardingToken = xForwardedTo ? extractForwardingToken(extractEmail(xForwardedTo)) : null;

  let profile: ProfileRow | null = null;
  let matchedBy: ProfileMatchedBy = null;

  if (forwardingToken) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .eq("forwarding_token", forwardingToken)
      .maybeSingle();

    if (error) {
      console.error("Error looking up profile by forwarding token:", error);
      return { ok: false };
    }
    profile = data;
    if (profile) matchedBy = "token";
  }

  if (!profile && senderEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .ilike("email", senderEmail)
      .maybeSingle();

    if (error) {
      console.error("Error looking up profile by sender email:", error);
      return { ok: false };
    }
    profile = data;
    if (profile) matchedBy = "from";
  }

  return { ok: true, profile, forwardingToken, senderEmail, matchedBy };
}
