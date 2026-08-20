// ============================================================================
// State for confirmed transactions: the Dashboard's list + income/expense
// totals. Subscribes to Realtime so a transaction approved from the Inbox
// (while the Dashboard tab is mounted) shows up without a manual refresh.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Transaction, TransactionType } from "../types/database";

function sortByDateDesc(items: Transaction[]): Transaction[] {
  return [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

let subscriberCount = 0;
let teardownChannel: (() => void) | null = null;

export interface TransactionInput {
  amount: number;
  type: TransactionType;
  category: string;
  merchant: string | null;
  account_id: string | null;
}

interface TransactionsState {
  items: Transaction[];
  isLoading: boolean;
  error: string | null;
  fetchTransactions: (userId: string) => Promise<void>;
  createTransaction: (userId: string, input: TransactionInput) => Promise<boolean>;
  updateTransaction: (id: string, input: TransactionInput) => Promise<boolean>;
  deleteTransaction: (id: string) => Promise<boolean>;
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

  createTransaction: async (userId: string, input: TransactionInput) => {
    const { data, error } = await supabase
      .from("transactions")
      .insert({ user_id: userId, date: new Date().toISOString(), ...input })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: sortByDateDesc([...get().items, data]) });
    return true;
  },

  updateTransaction: async (id: string, input: TransactionInput) => {
    const { data, error } = await supabase
      .from("transactions")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: sortByDateDesc(get().items.map((t) => (t.id === id ? data : t))) });
    return true;
  },

  deleteTransaction: async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: get().items.filter((t) => t.id !== id) });
    return true;
  },

  subscribe: (userId: string) => {
    // Both DashboardScreen and TransactionsScreen subscribe to this store,
    // so ref-count the underlying channel: a second `.channel()` call with
    // the same topic while the first is still subscribed throws ("cannot
    // add `postgres_changes` callbacks... after `subscribe()`"), so only
    // the first caller actually opens a channel; later callers just bump
    // the ref count, and the channel closes once the last one unmounts.
    subscriberCount += 1;
    if (!teardownChannel) {
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
