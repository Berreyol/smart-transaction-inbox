// ============================================================================
// forwardingConfirmationParser.ts
// Used by handleForwardingConfirmation.ts (see index.ts for how the dispatch
// works). Pure regex extraction for Gmail's "confirm auto-forwarding" email
// — the message Google sends to a forwarding target the first time a Gmail
// user sets up auto-forwarding to it. Example body:
//
//   someone@gmail.com has requested to automatically forward
//   mail to your email
//   address base+abc123@upload.pipedream.net.
//
//   To allow someone@gmail.com to automatically forward mail to
//   your address,
//   please click the link below to confirm the request:
//
//   https://mail.google.com/mail/vf-...
//
// Kept dependency-free and framework-agnostic (no Deno globals) so it can be
// sanity-checked with plain Node, same as parse-email/parser.ts.
// ============================================================================

// Confirmed against a real confirmation email (2026-09-09): Gmail currently
// sends these from mail-settings.google.com, not mail.google.com. Both are
// kept here since either could be genuine — Google hasn't documented this
// as a hard migration, and a stale email template could still land on the
// older host.
const GENUINE_HOSTNAMES = ["mail.google.com", "mail-settings.google.com"];

/**
 * Matches the security-critical property of this whole feature: we only ever
 * act on (fetch server-side, or show as a button in the app) a URL that
 * genuinely points at one of GENUINE_HOSTNAMES. An attacker can put an
 * arbitrary string in a spoofed email, but they cannot make that string a
 * real, live link hosted on Google's own domain — so this check alone rules
 * out both SSRF (the auto-confirm fetch could otherwise be pointed at
 * internal infrastructure or cloud metadata endpoints) and phishing (the
 * in-app button could otherwise point users at attacker-controlled content).
 *
 * Uses `new URL().hostname`, not a substring/regex match against the raw
 * string — a substring check would be bypassable with tricks like
 * "https://mail.google.com.evil.com/..." or a query-string decoy.
 */
export function isGenuineGoogleForwardingConfirmationUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    GENUINE_HOSTNAMES.includes(url.hostname) &&
    /^\/mail\/vf-/.test(url.pathname)
  );
}

/** Extracts the "+tag" subaddress out of an email's local-part, e.g. "base+ab12cd@x.com" -> "ab12cd". */
export function extractForwardingToken(address: string): string | null {
  const local = address.split("@")[0] ?? "";
  const plusIndex = local.indexOf("+");
  if (plusIndex === -1) return null;
  const token = local.slice(plusIndex + 1).trim();
  return token || null;
}

// Tolerant of Gmail's plain-text line wrapping (the sentence can be broken
// across lines at different points depending on wrap width), so `\s+`
// stands in for what's semantically just whitespace between words.
const REQUEST_HEADER_RE =
  /([^\s<>]+@[^\s<>]+?)\s+has requested to automatically forward\s+mail to your email\s+address\s+(\S+)/i;

const CONFIRM_URL_RE = /confirm the request:\s*\n+\s*(\S+)/i;

const TRAILING_PUNCTUATION_RE = /[.,;:)\]]+$/;

export interface ParsedForwardingConfirmation {
  /** The Gmail account that requested forwarding, e.g. "someone@gmail.com". Null if not found. */
  sourceEmail: string | null;
  /** The forwarding_token parsed out of the destination address embedded in the body, if present. */
  forwardingToken: string | null;
  /** Verified (see isGenuineGoogleForwardingConfirmationUrl) confirmation link. */
  confirmationUrl: string;
}

/**
 * Returns null for anything that isn't a genuine Gmail forwarding
 * confirmation email — in particular, whenever no URL matching Google's own
 * domain can be found, regardless of what the surrounding text claims. This
 * is the single gate the rest of the pipeline (auto-confirm fetch, and the
 * in-app confirm button) relies on for safety.
 */
export function parseForwardingConfirmationEmail(text: string): ParsedForwardingConfirmation | null {
  const urlMatch = text.match(CONFIRM_URL_RE);
  if (!urlMatch) return null;

  const confirmationUrl = urlMatch[1].replace(TRAILING_PUNCTUATION_RE, "");
  if (!isGenuineGoogleForwardingConfirmationUrl(confirmationUrl)) return null;

  const headerMatch = text.match(REQUEST_HEADER_RE);
  const sourceEmail = headerMatch?.[1]?.toLowerCase() ?? null;
  const destination = headerMatch?.[2]?.replace(TRAILING_PUNCTUATION_RE, "") ?? null;
  const forwardingToken = destination ? extractForwardingToken(destination) : null;

  return { sourceEmail, forwardingToken, confirmationUrl };
}
