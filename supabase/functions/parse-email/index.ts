// ============================================================================
// supabase/functions/parse-email/index.ts
//
// Receives a POST from the inbound-email transport (currently a Cloudflare
// Email Worker, cloudflare/email-worker/ — previously a Pipedream workflow,
// see that directory's README for why it moved) for every email a user's
// personalized address receives. That's two different kinds of email,
// dispatched after a shared identify-the-user step:
//
//   1. A forwarded bank notification — extracts transaction details with
//      regex, stores a pending_transactions row, and pushes an Expo
//      notification asking the user to review it.
//   2. Gmail's "confirm auto-forwarding" email — the message Google sends
//      the first time a user sets up auto-forwarding from their own Gmail
//      to this personalized address. Historically this required manually
//      opening that email and clicking the link for every new user; this
//      instead attempts the confirmation server-side, falling back to
//      surfacing an in-app "Confirm" button (see ForwardingConfirmationBanner)
//      when the automatic attempt doesn't succeed. See the SECURITY comment
//      further down and _shared/forwardingConfirmationParser.ts for why the
//      URL this acts on is safe to fetch server-side / show to the user.
//
// This dispatch deliberately lives here rather than in the transport layer
// (a Pipedream workflow branch, or guessing in the Cloudflare Worker) — see
// git history for supabase/functions/handle-forwarding-confirmation, a
// separate function this replaced: it was never actually deployed (the
// transport always posted everything here regardless), and a wrong guess at
// the transport layer risked silently dropping a real transaction email.
//
// Identifying the user: every profile has a forwarding_token (see migration
// 0006), and the app shows each user a personalized address of the form
// inbox+<token>@yourdomain.com. We try that token first, read out of (in
// order) the X-Forwarded-To header, then the `to` address, then fall back
// to matching From by email. Three sources because forwarding mechanisms
// disagree on what ends up where: an auto-forward *filter rule* routes at
// the SMTP level to the personalized address but typically leaves the
// message's own To: header as the original recipient — the destination
// only shows up in X-Forwarded-To (added by the relay) — while a manual
// "Forward" doesn't add that header at all, but does put the personalized
// address in `to` (since it's the actual recipient of the new message) and
// rewrites From to the forwarder's own address, which is what the final
// fallback catches. (The Cloudflare Worker sets X-Forwarded-To from the SMTP
// envelope for every email, confirmation notices included, so this same
// lookup identifies the user for both dispatch branches without change.)
//
// Expected payload shape (PipedreamEmailEvent below, name kept from this
// function's original transport): `to`/`from` as either a bare address
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { parseForwardingConfirmationEmail } from "../_shared/forwardingConfirmationParser.ts";
import { matchBankAccount, parseTransactionEmail } from "./parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Shared secret configured as a query param on the URL the Cloudflare
// Worker POSTs to (e.g. https://<project-ref>.supabase.co/functions/v1/parse-email?token=xxx),
// so only that worker can trigger this function. Set with:
//   supabase secrets set WEBHOOK_TOKEN=xxx
const WEBHOOK_TOKEN = Deno.env.get("WEBHOOK_TOKEN");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// service_role client: bypasses RLS, required to read profiles by email and
// insert into pending_transactions on the user's behalf.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ----------------------------------------------------------------------------
// Pipedream's Email trigger event (subset of fields we actually use).
// mailparser normally structures `from`/`to` as AddressObjects ({value:
// [{address, name}], text}), but in practice this has also shown up as a
// bare address string — so MailAddressField accepts either and
// extractAddress() below handles both. `headers`/`headerLines` are
// mailparser's usual home for anything not promoted to a top-level field
// (like X-Forwarded-To), but that too has shown up flattened directly onto
// the event instead — getHeader() checks all three shapes.
// ----------------------------------------------------------------------------
type MailAddressField = string | { value?: { address?: string; name?: string }[]; text?: string };

interface PipedreamEmailEvent {
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
function extractEmail(raw: string): string {
  const first = raw.split(",")[0] ?? raw;
  const angleMatch = first.match(/<([^>]+)>/);
  return (angleMatch?.[1] ?? first).trim().toLowerCase();
}

/** Extracts a lowercased address out of a from/to field, whichever of the two shapes it arrived as. */
function extractAddress(field: MailAddressField | undefined): string {
  if (!field) return "";
  if (typeof field === "string") return extractEmail(field);
  return field.value?.[0]?.address?.toLowerCase() ?? extractEmail(field.text ?? "");
}

/** Case-insensitively reads a header value, trying every shape it might have arrived in. */
function getHeader(payload: PipedreamEmailEvent, name: string): string | null {
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

/** Extracts the "+tag" subaddress out of an email's local-part, e.g. "base+ab12cd@x.com" -> "ab12cd". */
function extractForwardingToken(address: string): string | null {
  const local = address.split("@")[0] ?? "";
  const plusIndex = local.indexOf("+");
  if (plusIndex === -1) return null;
  const token = local.slice(plusIndex + 1).trim();
  return token || null;
}

/** Strips HTML tags down to plain text as a fallback when the plain-text body is absent. */
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

async function sendExpoPushNotification(pushToken: string, title: string, body: string) {
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
        title,
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

/**
 * GETs an already-verified-genuine (see isGenuineGoogleForwardingConfirmationUrl
 * in _shared/forwardingConfirmationParser.ts) Gmail forwarding confirmation
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

  const senderEmail = extractAddress(payload.from);
  const xForwardedTo = getHeader(payload, "x-forwarded-to");
  const forwardingToken = xForwardedTo
    ? extractForwardingToken(extractEmail(xForwardedTo))
    : null;
  const htmlText = payload.html ? htmlToText(payload.html) : "";
  const rawText = payload.text?.trim() || htmlText;

  if (!rawText) {
    return new Response("Missing body", { status: 400 });
  }
  if (!forwardingToken && !senderEmail) {
    return new Response("Missing sender", { status: 400 });
  }

  // 1. Identify the user: forwarding_token 
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

  if (!profile && senderEmail) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, expo_push_token")
      .ilike("email", senderEmail)
      .maybeSingle();

    if (error) {
      console.error("Error looking up profile by sender email:", error);
      return new Response("Internal error", { status: 500 });
    }
    profile = data;
  }

  if (!profile) {
    // No matching user — silently accept so the transport doesn't retry
    // forever, but do nothing further. Nothing to notify, nothing to store.
    console.warn(
      `No profile found for forwarding token "${forwardingToken}" or sender "${senderEmail}"`,
    );
    return new Response("OK (no matching user)", { status: 200 });
  }

  // 1b. Dispatch: is this Gmail's "confirm auto-forwarding" notice rather
  // than a bank transaction email? parseForwardingConfirmationEmail is the
  // single safety gate for this whole branch — it returns null for anything
  // that doesn't contain a URL genuinely hosted on mail.google.com,
  // regardless of how convincing the surrounding text looks (see its own
  // comments and _shared/forwardingConfirmationParser.ts's header for the
  // full SSRF/phishing threat model this closes off). Checked after user
  // identification (not before) since both branches need it and it's the
  // same lookup either way.
  const confirmation = parseForwardingConfirmationEmail(rawText);
  if (confirmation) {
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

  // 2. Parse the email with the generic regex engine (handles known
  // phrasings like Mercado Pago's plus a keyword+currency-pattern
  // catch-all — see parser.ts). Subject and both body variants are folded
  // into one search string so a single amount/keyword match can look across
  // all of them regardless of which one the bank happened to put the data in.
  const subject = payload.subject ?? "";
  const searchText = [subject, rawText, htmlText && htmlText !== rawText ? htmlText : ""]
    .filter(Boolean)
    .join("\n");
  const parsed = parseTransactionEmail(searchText, subject, payload.html);

  // 2b. Suggest one of the user's saved bank accounts, if its alias appears
  // in the email (e.g. an account aliased "Costco Banamex" matches
  // "COSTCO BANAMEX**854" in the body) — see matchBankAccount() in parser.ts.
  // Just a suggestion the Inbox pre-fills; the user still confirms it at
  // approval time. Also used to label bank_name, falling back to "Generic"
  // when nothing matches.
  const { data: bankAccounts, error: bankAccountsError } = await supabase
    .from("bank_accounts")
    .select("id, bank_name, account_alias")
    .eq("user_id", profile.id);

  if (bankAccountsError) {
    console.error("Error fetching bank accounts for matching:", bankAccountsError);
  }
  const matchedAccount = bankAccounts ? matchBankAccount(searchText, bankAccounts) : null;

  // 2c. Substitute a previously user-renamed merchant name, if this exact
  // raw merchant string has been renamed before (e.g. "AMZN MKTP US*2K3AB"
  // -> "Amazon" — see merchant_alias_map, populated by
  // approve_pending_transaction when a user's edit differs from the raw
  // parsed merchant). raw_merchant is stored alongside regardless, so a
  // later rename of *this* row still has the original string to key off of.
  let displayMerchant = parsed.merchant;
  if (parsed.merchant) {
    const rawMerchantKey = parsed.merchant.trim().toLowerCase();
    const { data: alias, error: aliasError } = await supabase
      .from("merchant_alias_map")
      .select("display_merchant")
      .eq("user_id", profile.id)
      .eq("raw_merchant_key", rawMerchantKey)
      .maybeSingle();

    if (aliasError) {
      console.error("Error looking up merchant alias:", aliasError);
    } else if (alias) {
      displayMerchant = alias.display_merchant;
    }
  }

  // 3. Store as a pending transaction awaiting user approval.
  const { error: insertError } = await supabase.from("pending_transactions").insert({
    user_id: profile.id,
    amount: parsed.amount,
    type: parsed.type,
    merchant: displayMerchant,
    raw_merchant: parsed.merchant,
    subject: subject.trim() || null,
    bank_name: matchedAccount?.bank_name ?? "Generic",
    account_id: matchedAccount?.id ?? null,
    date: new Date().toISOString(),
    raw_text: rawText.slice(0, 5000), // guard against pathologically large bodies
    status: "pending",
  });

  if (insertError) {
    console.error("Error inserting pending transaction:", insertError);
    return new Response("Internal error", { status: 500 });
  }

  // 4. Notify the user's device, if we have a push token on file.
  if (profile.expo_push_token) {
    const amountLabel = parsed.amount != null ? `$${parsed.amount.toFixed(2)}` : "";
    const detail = displayMerchant ?? matchedAccount?.account_alias ?? null;
    const body = detail ? `${detail} ${amountLabel}`.trim() : amountLabel;
    await sendExpoPushNotification(profile.expo_push_token, "New transaction detected!", body);
  }

  return new Response("OK", { status: 200 });
});
