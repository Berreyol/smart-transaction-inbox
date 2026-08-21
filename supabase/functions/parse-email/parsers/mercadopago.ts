// ============================================================================
// MercadoPagoParser. Mercado Pago isn't a bank (it's a digital wallet), but
// bank_name is free text everywhere it's stored, so it fits the same "bank"
// slot without any schema change.
//
// Handles two notification types as dedicated patterns, since the shared
// regex engine's keyword lists don't cover either (see the comments on each
// regex below for why): funds landing in the wallet's available balance
// (e.g. after a sale or an incoming transfer clears), and an outgoing
// transfer being sent. Any other Mercado Pago email (a purchase
// notification, a payment received via card, etc.) falls back to that
// shared engine, same as banamexParser.
// ============================================================================
import { normalizeAmount, parseTransactionEmail } from "../parser.ts";
import type { BankParser } from "./types.ts";

const MERCADO_PAGO_NAME_RE = /mercado\s*pago/i;

// e.g. "Tus $ 21,000.00 ya están disponibles". Matched as its own pattern
// rather than adding "disponible(s)" to parser.ts's shared INCOME_KEYWORDS,
// since that word alone is too generic/common in routine Mexican banking
// emails (e.g. "saldo disponible" balance blurbs) to add there without
// causing false-positive income detection on unrelated banks' emails.
const FUNDS_AVAILABLE_RE = /tus\s+\$\s?([\d.,]+)\s+ya\s+est[aá]n\s+disponibles?/i;

// e.g. "Ya enviamos tu transferencia de $ 163.01" — an outgoing transfer.
// Not covered by the shared EXPENSE_KEYWORDS ("transferencia" alone isn't
// there, only "transferencia recibida" is listed, and only on the income
// side), so handled here instead of widening that shared list.
const TRANSFER_SENT_RE = /enviamos\s+tu\s+transferencia\s+de\s+\$\s?([\d.,]+)/i;

// e.g. "Nombre y apellido: Global Gas" in the "Datos del beneficiario"
// section of a transfer-sent email — the actual recipient, used as merchant.
const BENEFICIARY_NAME_RE = /nombre y apellido:\s*([^\n]+)/i;

export const mercadoPagoParser: BankParser = {
  bankName: "Mercado Pago",

  matchStrategy: (text, subject) => MERCADO_PAGO_NAME_RE.test(subject) || MERCADO_PAGO_NAME_RE.test(text),

  parse: (text) => {
    const availableMatch = text.match(FUNDS_AVAILABLE_RE);
    if (availableMatch) {
      return {
        amount: normalizeAmount(availableMatch[1]),
        type: "income",
        merchant: null,
        date: new Date().toISOString(),
      };
    }

    const transferMatch = text.match(TRANSFER_SENT_RE);
    if (transferMatch) {
      const beneficiary = text.match(BENEFICIARY_NAME_RE)?.[1]?.trim() ?? null;
      return {
        amount: normalizeAmount(transferMatch[1]),
        type: "expense",
        merchant: beneficiary,
        date: new Date().toISOString(),
      };
    }

    const { amount, type, merchant } = parseTransactionEmail(text);
    return { amount, type, merchant, date: new Date().toISOString() };
  },
};
