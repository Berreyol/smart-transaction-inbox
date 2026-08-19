// ============================================================================
// State for the user's saved bank accounts: the list shown in the Accounts
// modal, the Inbox approval picker, and the Dashboard account filter.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { BankAccount } from "../types/database";

let subscriberCount = 0;
let teardownChannel: (() => void) | null = null;

interface BankAccountsState {
  items: BankAccount[];
  isLoading: boolean;
  error: string | null;
  fetchBankAccounts: (userId: string) => Promise<void>;
  addBankAccount: (userId: string, bankName: string, accountAlias: string) => Promise<boolean>;
  deleteBankAccount: (id: string) => Promise<boolean>;
  /** Subscribes to realtime changes on this user's bank accounts. Returns an unsubscribe function. */
  subscribe: (userId: string) => () => void;
}

export const useBankAccountsStore = create<BankAccountsState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchBankAccounts: async (userId: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ items: data ?? [], isLoading: false });
  },

  addBankAccount: async (userId: string, bankName: string, accountAlias: string) => {
    const trimmedAlias = accountAlias.trim();
    if (!bankName || !trimmedAlias) return false;

    const { data, error } = await supabase
      .from("bank_accounts")
      .insert({ user_id: userId, bank_name: bankName, account_alias: trimmedAlias })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: [...get().items, data] });
    return true;
  },

  deleteBankAccount: async (id: string) => {
    const { error } = await supabase.from("bank_accounts").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: get().items.filter((a) => a.id !== id) });
    return true;
  },

  subscribe: (userId: string) => {
    // Ref-counted like categoriesStore/transactionsStore — see those for why
    // a second `.channel()` call on the same topic can't just be repeated.
    subscriberCount += 1;
    if (!teardownChannel) {
      const channel = supabase
        .channel(`bank_accounts:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bank_accounts",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            get().fetchBankAccounts(userId);
          },
        )
        .subscribe();
      teardownChannel = () => supabase.removeChannel(channel);
    }

    return () => {
      subscriberCount -= 1;
      if (subscriberCount <= 0 && teardownChannel) {
        teardownChannel();
        teardownChannel = null;
        subscriberCount = 0;
      }
    };
  },
}));
