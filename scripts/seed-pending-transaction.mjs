#!/usr/bin/env node
// ============================================================================
// Sends a fake forwarded-bank-email payload straight at the parse-email edge
// function, shaped exactly like what Pipedream's Email trigger would POST
// (see supabase/functions/parse-email/index.ts's PipedreamEmailEvent). This
// exercises the real parsing pipeline end-to-end — not a hand-crafted DB row
// — so it's a better test of parser.ts than inserting values directly.
//
// Needs (in .env, NOT prefixed with EXPO_PUBLIC_ — these must never reach
// the app bundle):
//   TEST_WEBHOOK_TOKEN          the target project's WEBHOOK_TOKEN
//   TEST_USER_FORWARDING_TOKEN  the test profile's forwarding_token
//     (Inbox screen's "@" button in-app, or:
//      select forwarding_token from profiles where email = '...';)
// Reuses EXPO_PUBLIC_SUPABASE_URL (already in .env) as the target project —
// double-check that's pointed at dev before running this, never prod.
//
// Usage:
//   node scripts/seed-pending-transaction.mjs [preset]
//   preset: all (default) | null | full | partial
// ============================================================================

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

const env = { ...loadEnv(join(__dirname, "..", ".env")), ...process.env };

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const WEBHOOK_TOKEN = env.TEST_WEBHOOK_TOKEN;
const FORWARDING_TOKEN = env.TEST_USER_FORWARDING_TOKEN;

const missing = ["EXPO_PUBLIC_SUPABASE_URL", "TEST_WEBHOOK_TOKEN", "TEST_USER_FORWARDING_TOKEN"].filter(
  (key) => !env[key],
);
if (missing.length > 0) {
  console.error(`Missing from .env: ${missing.join(", ")}`);
  console.error("See the header comment in this script for what each one is and where to find it.");
  process.exit(1);
}

// PROD's project ref, guarded the same way the CI workflows guard against
// db push/deploy landing on the wrong project.
const PROD_REF = "qqxhqcbbgmzylwkxfhbr";
if (SUPABASE_URL.includes(PROD_REF)) {
  console.error(`Refusing to run: EXPO_PUBLIC_SUPABASE_URL points at the production project (${PROD_REF}).`);
  console.error("Point .env at the dev project before running this script.");
  process.exit(1);
}

const TO_ADDRESS = `inbox+${FORWARDING_TOKEN}@example.pipedream.net`;

const PRESETS = {
  // No amount/type/merchant detectable — exercises the "can't approve, use
  // Edit to fill it in" path.
  null: {
    subject: "Notificación de tu cuenta",
    text: "Hemos registrado actividad en tu cuenta. Consulta el detalle en la app.",
  },
  // Fully parseable: amount, type (via "Retiro"), and merchant (via the
  // "Establecimiento" label) all extract cleanly. Real Costco Banamex email.
  full: {
    subject: "Se realizó la siguiente operación: Retiro / Compra",
    text: [
      "Se realizó la siguiente operación: Retiro / Compra",
      "ALEJANDRO LOPEZ BERRELLEZA",
      "",
      "COSTCO BANAMEX**854",
      "Detalle de la operación",
      "",
      "Monto",
      "",
      "$684.00",
      "",
      "Establecimiento",
      "",
      "MERIDIANO CAFE ZAP",
      "",
      "Fecha y hora",
      "",
      "2026/08/23 01:36:58 PM",
      "",
      "Estatus",
      "",
      "Exitoso",
    ].join("\n"),
  },
  // Amount + type parse (via "depósito"), merchant doesn't — "en tu cuenta"
  // doesn't match MERCHANT_REGEX since "tu" isn't capitalized. Exercises
  // editing just the merchant while leaving amount/type alone.
  partial: {
    subject: "Aviso de depósito",
    text: "Se ha registrado un depósito por $250.00 en tu cuenta.",
  },
};

async function send(name, { subject, text }) {
  const payload = {
    from: { value: [{ address: "notificaciones@banamex.com", name: "Banamex" }] },
    to: { value: [{ address: TO_ADDRESS, name: "" }] },
    subject,
    text,
  };

  const url = `${SUPABASE_URL}/functions/v1/parse-email?token=${encodeURIComponent(WEBHOOK_TOKEN)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.text();
  console.log(`[${name}] ${res.status} ${res.statusText} — ${body}`);
}

const preset = process.argv[2] ?? "all";
const names = preset === "all" ? Object.keys(PRESETS) : [preset];

for (const name of names) {
  const scenario = PRESETS[name];
  if (!scenario) {
    console.error(`Unknown preset "${name}". Options: all, ${Object.keys(PRESETS).join(", ")}`);
    process.exit(1);
  }
  await send(name, scenario);
}
