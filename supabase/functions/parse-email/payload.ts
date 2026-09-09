// ============================================================================
// Normalizes the raw inbound-email payload into primitives the rest of
// parse-email works with (an address, a header value, a forwarding token,
// plain text). Doesn't touch Supabase or make any decisions about what kind
// of email this is — purely payload -> primitive extraction, so it's the
// same dependency-free/pure style as parser.ts.
// ============================================================================

// Re-exported rather than redefined: forwardingConfirmationParser.ts needs
// this same extraction (for the destination address inside a confirmation
// email's body, not just X-Forwarded-To), so it lives there as the one
// canonical copy.
export { extractForwardingToken } from "./forwardingConfirmationParser.ts";

// Pipedream's Email trigger event (subset of fields we actually use).
// mailparser normally structures `from`/`to` as AddressObjects ({value:
// [{address, name}], text}), but in practice this has also shown up as a
// bare address string — so MailAddressField accepts either and
// extractAddress() below handles both. `headers`/`headerLines` are
// mailparser's usual home for anything not promoted to a top-level field
// (like X-Forwarded-To), but that too has shown up flattened directly onto
// the event instead — getHeader() checks all three shapes.
export type MailAddressField =
  | string
  | { value?: { address?: string; name?: string }[]; text?: string };

export interface PipedreamEmailEvent {
  from?: MailAddressField;
  to?: MailAddressField;
  subject?: string;
  text?: string; // plain-text body
  html?: string; // HTML body (fallback when text is absent)
  date?: string;
  headers?: Record<string, string | string[]>;
  headerLines?: { key?: string; line?: string }[];
  [header: string]: unknown; // arbitrary headers Pipedream may flatten onto the event, e.g. "x-forwarded-to"
}

/** Extracts a bare email address out of a "Name <email>" (optionally comma-separated) string. */
export function extractEmail(raw: string): string {
  const first = raw.split(",")[0] ?? raw;
  const angleMatch = first.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? first).trim().toLowerCase();
}

/** Extracts a lowercased address out of a from/to field, whichever of the two shapes it arrived as. */
export function extractAddress(field: MailAddressField | undefined): string {
  if (!field) return "";
  if (typeof field === "string") return extractEmail(field);
  return field.value?.[0]?.address?.toLowerCase() ?? extractEmail(field.text ?? "");
}

/** Case-insensitively reads a header value, trying every shape it might have arrived in. */
export function getHeader(payload: PipedreamEmailEvent, name: string): string | null {
  const lower = name.toLowerCase();

  const direct = payload[lower];
  if (typeof direct === "string" && direct) return direct;

  const fromHeaders = payload.headers?.[lower];
  if (typeof fromHeaders === "string" && fromHeaders) return fromHeaders;
  if (Array.isArray(fromHeaders) && fromHeaders[0]) return fromHeaders[0];

  const line = payload.headerLines?.find((h) => h.key?.toLowerCase() === lower)?.line;
  if (line) {
    const colonIndex = line.indexOf(":");
    return (colonIndex === -1 ? line : line.slice(colonIndex + 1)).trim();
  }

  return null;
}

/** Strips HTML tags down to plain text as a fallback when the plain-text body is absent. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
