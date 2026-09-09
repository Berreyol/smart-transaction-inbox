// ============================================================================
// Handles a forwarded bank notification email: extracts transaction details
// with regex, stores a pending_transactions row, and pushes an Expo
// notification asking the user to review it.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PipedreamEmailEvent } from "./payload.ts";
import type { ProfileRow } from "./identifyUser.ts";
import { matchBankAccount, parseTransactionEmail } from "./parser.ts";
import { sendExpoPushNotification } from "./notifications.ts";

export async function handleTransactionEmail(
  supabase: SupabaseClient,
  payload: PipedreamEmailEvent,
  profile: ProfileRow,
  rawText: string,
  htmlText: string,
): Promise<Response> {
  // Parse the email with the generic regex engine (handles known phrasings
  // like Mercado Pago's plus a keyword+currency-pattern catch-all — see
  // parser.ts). Subject and both body variants are folded into one search
  // string so a single amount/keyword match can look across all of them
  // regardless of which one the bank happened to put the data in.
  const subject = payload.subject ?? "";
  const searchText = [subject, rawText, htmlText && htmlText !== rawText ? htmlText : ""]
    .filter(Boolean)
    .join("\n");
  const parsed = parseTransactionEmail(searchText, subject, payload.html);

  // Suggest one of the user's saved bank accounts, if its alias appears in
  // the email (e.g. an account aliased "Costco Banamex" matches "COSTCO
  // BANAMEX**854" in the body) — see matchBankAccount() in parser.ts. Just
  // a suggestion the Inbox pre-fills; the user still confirms it at
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

  // Substitute a previously user-renamed merchant name, if this exact raw
  // merchant string has been renamed before (e.g. "AMZN MKTP US*2K3AB" ->
  // "Amazon" — see merchant_alias_map, populated by
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

  // Store as a pending transaction awaiting user approval.
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

  // Notify the user's device, if we have a push token on file.
  if (profile.expo_push_token) {
    const amountLabel = parsed.amount != null ? `$${parsed.amount.toFixed(2)}` : "";
    const detail = displayMerchant ?? matchedAccount?.account_alias ?? null;
    const body = detail ? `${detail} ${amountLabel}`.trim() : amountLabel;
    await sendExpoPushNotification(profile.expo_push_token, "New transaction detected!", body);
  }

  return new Response("OK", { status: 200 });
}
