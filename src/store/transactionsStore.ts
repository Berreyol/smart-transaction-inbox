// ============================================================================
// State for confirmed transactions: the Dashboard's list + income/expense
// totals. Subscribes to Realtime so a transaction approved from the Inbox
// (while the Dashboard tab is mounted) shows up without a manual refresh.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Transaction } from "../types/database";

interface TransactionsState {
  items: Transaction[];
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (userId: string) => Promise<void>;
  subscribe: (userId: string) => () => void;
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchTransactions: async (userId: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ items: data ?? [], isLoading: false });
  },

  subscribe: (userId: string) => {
    const channel = supabase
      .channel(`transactions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          get().fetchTransactions(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
