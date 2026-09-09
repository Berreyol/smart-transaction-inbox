// ============================================================================
// forwardingConfirmationParser.test.ts
// Unit tests for forwardingConfirmationParser.ts, with particular emphasis
// on the URL allowlist (isGenuineGoogleForwardingConfirmationUrl) — that's
// the control this whole feature's safety depends on, so it's tested
// against realistic attack payloads (domain-confusion tricks, SSRF targets,
// phishing redirects), not just the happy path. Run with:
//   deno test supabase/functions/parse-email/forwardingConfirmationParser.test.ts
// ============================================================================

import { assertEquals } from "jsr:@std/assert@1";
import {
  extractForwardingToken,
  isGenuineGoogleForwardingConfirmationUrl,
  parseForwardingConfirmationEmail,
} from "./forwardingConfirmationParser.ts";

const REAL_CONFIRMATION_URL =
  "https://mail.google.com/mail/vf-%5BANGjdJ-6KGoFdmUFZP_ExjejgTbQr0mJO8qZLzqiyi7X5oDhZTYJYQb3WYo5PxLi6z5ON9ZAPXZQSqVwz8R8H7P5G6n09TFQhBZbkYbphwBKVG6xL_hc9xpoq-wT1RQ%5D-3tEenYjQdVmINN-83QpaonYYZlk";

const SAMPLE_EMAIL = `berrytransactions@gmail.com has requested to automatically forward
mail to your email
address emnnxqv0vgo9qma+asd12312asd@upload.pipedream.net.

To allow berrytransactions@gmail.com to automatically forward mail to
your address,
please click the link below to confirm the request:

${REAL_CONFIRMATION_URL}

If you click the link and it appears to be broken, please copy and paste it
into a new browser window.

Thanks for using Gmail.
`;

// ----------------------------------------------------------------------------
// isGenuineGoogleForwardingConfirmationUrl()
// ----------------------------------------------------------------------------

Deno.test("isGenuineGoogleForwardingConfirmationUrl - accepts a real confirmation URL", () => {
  assertEquals(isGenuineGoogleForwardingConfirmationUrl(REAL_CONFIRMATION_URL), true);
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - accepts mail-settings.google.com (Gmail's current sending host)", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl("https://mail-settings.google.com/mail/vf-abc"),
    true,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects domain-confusion suffix trick", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl("https://mail.google.com.evil.com/mail/vf-abc"),
    false,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects domain-confusion suffix trick on the settings host too", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl("https://mail-settings.google.com.evil.com/mail/vf-abc"),
    false,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects an unrelated domain", () => {
  assertEquals(isGenuineGoogleForwardingConfirmationUrl("https://evil-phishing-site.com/steal"), false);
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects an SSRF target (cloud metadata)", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl(
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    ),
    false,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects plain http even on the right host", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl("http://mail.google.com/mail/vf-abc"),
    false,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects the right host with the wrong path", () => {
  assertEquals(
    isGenuineGoogleForwardingConfirmationUrl("https://mail.google.com/some/other/path"),
    false,
  );
});

Deno.test("isGenuineGoogleForwardingConfirmationUrl - rejects an unparseable string", () => {
  assertEquals(isGenuineGoogleForwardingConfirmationUrl("not a url at all"), false);
});

// ----------------------------------------------------------------------------
// extractForwardingToken()
// ----------------------------------------------------------------------------

Deno.test("extractForwardingToken - extracts the +tag local-part suffix", () => {
  assertEquals(
    extractForwardingToken("emnnxqv0vgo9qma+asd12312asd@upload.pipedream.net"),
    "asd12312asd",
  );
});

Deno.test("extractForwardingToken - returns null when there's no +tag", () => {
  assertEquals(extractForwardingToken("plain@upload.pipedream.net"), null);
});

// ----------------------------------------------------------------------------
// parseForwardingConfirmationEmail()
// ----------------------------------------------------------------------------

Deno.test("parseForwardingConfirmationEmail - extracts source email, token, and URL from a real email", () => {
  assertEquals(parseForwardingConfirmationEmail(SAMPLE_EMAIL), {
    sourceEmail: "berrytransactions@gmail.com",
    forwardingToken: "asd12312asd",
    confirmationUrl: REAL_CONFIRMATION_URL,
  });
});

Deno.test("parseForwardingConfirmationEmail - returns null when there's no confirmation URL", () => {
  assertEquals(parseForwardingConfirmationEmail("just some unrelated spam email"), null);
});

Deno.test("parseForwardingConfirmationEmail - returns null when the embedded URL isn't genuinely Google's", () => {
  const spoofed = SAMPLE_EMAIL.replace(REAL_CONFIRMATION_URL, "https://evil-phishing-site.com/steal");
  assertEquals(parseForwardingConfirmationEmail(spoofed), null);
});

Deno.test("parseForwardingConfirmationEmail - still extracts a genuine URL even if the header text is tampered with", () => {
  // The header line is just used for identification (which profile to
  // notify) — it isn't the security boundary, so a genuine URL should still
  // be honored even if surrounding text doesn't match the expected phrasing.
  const tampered = SAMPLE_EMAIL.replace(
    "has requested to automatically forward",
    "wants to forward",
  );
  const result = parseForwardingConfirmationEmail(tampered);
  assertEquals(result?.confirmationUrl, REAL_CONFIRMATION_URL);
  assertEquals(result?.sourceEmail, null);
});
