#!/usr/bin/env node
// ============================================================================
// Sends a synthetic raw MIME email through the exact same parse -> reshape
// logic as ../src/index.ts's email() handler (postal-mime parsing, then the
// X-Forwarded-To injection — see that file's comment on why it's needed),
// then POSTs the result to parse-email. Validates the whole Worker pipeline
// against a real project without needing Miniflare's local email-testing
// harness (`wrangler dev`'s /cdn-cgi/handler/email), which has been observed
// to error inside its own harness — before ever reaching the Worker's code —
// in at least one sandboxed environment. If that's fixed upstream, prefer
// testing via the real harness; this remains useful either way since it
// exercises the real deployed parse-email function, not a local simulation.
//
// Needs (in .env, NOT prefixed with EXPO_PUBLIC_ — the same variables
// scripts/seed-pending-transaction.mjs at the repo root already uses):
//   TEST_WEBHOOK_TOKEN          the target project's WEBHOOK_TOKEN
//   TEST_USER_FORWARDING_TOKEN  the test profile's forwarding_token
// Reuses EXPO_PUBLIC_SUPABASE_URL (already in .env) as the target project.
//
// By default refuses to run against the production project ref (same guard
// as seed-pending-transaction.mjs). To deliberately test prod, pass its
// details as real environment variables (not via .env) plus ALLOW_PROD=1:
//   ALLOW_PROD=1 \
//   SUPABASE_URL=https://<prod-ref>.supabase.co \
//   WEBHOOK_TOKEN=<prod webhook token> \
//   FORWARDING_TOKEN=<a real or throwaway prod forwarding_token> \
//   node cloudflare/email-worker/scripts/send-test-email.mjs
//
// Usage: node cloudflare/email-worker/scripts/send-test-email.mjs
// ============================================================================

import PostalMime from "postal-mime";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(path) {
  const env = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return env;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const dotEnv = loadEnv(join(__dirname, "..", "..", "..", ".env"));

// Explicit overrides (SUPABASE_URL/WEBHOOK_TOKEN/FORWARDING_TOKEN as real
// process env vars, not from .env) take precedence and use different names
// than the .env-sourced defaults so a stray .env value can't silently win.
const SUPABASE_URL = process.env.SUPABASE_URL ?? dotEnv.EXPO_PUBLIC_SUPABASE_URL;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN ?? dotEnv.TEST_WEBHOOK_TOKEN;
const FORWARDING_TOKEN = process.env.FORWARDING_TOKEN ?? dotEnv.TEST_USER_FORWARDING_TOKEN;
const usedExplicitOverride = Boolean(process.env.SUPABASE_URL);

if (!SUPABASE_URL || !WEBHOOK_TOKEN || !FORWARDING_TOKEN) {
  console.error("Missing SUPABASE_URL/WEBHOOK_TOKEN/FORWARDING_TOKEN (env vars) or the .env equivalents.");
  console.error("See the header comment in this script for what each one is and where to find it.");
  process.exit(1);
}

const PROD_REF = "qqxhqcbbgmzylwkxfhbr";
if (SUPABASE_URL.includes(PROD_REF) && !(usedExplicitOverride && process.env.ALLOW_PROD === "1")) {
  console.error(`Refusing to run against the production project (${PROD_REF}).`);
  console.error("To deliberately test prod, pass SUPABASE_URL/WEBHOOK_TOKEN/FORWARDING_TOKEN as real env");
  console.error("vars (not via .env) plus ALLOW_PROD=1 — see this script's header comment for the full command.");
  process.exit(1);
}

const TO_ADDRESS = `inbox+${FORWARDING_TOKEN}@example.com`;

const rawEmail = [
  "From: Test Bank <alerts@testbank.com>",
  `To: ${TO_ADDRESS}`,
  "Subject: Purchase Alert",
  `Message-ID: <test-${Date.now()}@testbank.com>`,
  "Content-Type: text/plain; charset=utf-8",
  "",
  "You made a purchase of $42.50 at Test Merchant on your card ending 1234.",
  "",
].join("\r\n");

const parsed = await PostalMime.parse(rawEmail);

const headers = {};
for (const h of parsed.headers) headers[h.key.toLowerCase()] = h.value;
headers["x-forwarded-to"] = TO_ADDRESS;

const payload = {
  from: parsed.from?.address ?? "",
  to: TO_ADDRESS,
  subject: parsed.subject ?? "",
  text: parsed.text ?? "",
  html: parsed.html ?? "",
  headers,
};

console.log(`Target: ${SUPABASE_URL} (forwarding_token: ${FORWARDING_TOKEN})`);

const url = `${SUPABASE_URL}/functions/v1/parse-email?token=${encodeURIComponent(WEBHOOK_TOKEN)}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

console.log(`${res.status} ${res.statusText} — ${await res.text()}`);
