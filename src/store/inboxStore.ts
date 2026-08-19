// ============================================================================
// State for the Smart Transaction Inbox: the list of pending_transactions
// awaiting user review, plus approve/reject actions.
//
// Approve calls the `approve_pending_transaction` RPC (see
// supabase/migrations/0002_approve_pending_transaction.sql) so the move into
// `transactions` and the removal from `pending_transactions` happen as one
// atomic server-side operation. Reject is a plain delete — nothing else
// depends on that row existing.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { PendingTransaction } from "../types/database";

interface InboxState {
  items: PendingTransaction[];
  isLoading: boolean;
  error: string | null;
  fetchPending: (userId: string) => Promise<void>;
  approve: (pendingId: string, category: string) => Promise<boolean>;
  reject: (pendingId: string) => Promise<boolean>;
  /** Subscribes to realtime changes on this user's pending queue. Returns an unsubscribe function. */
  subscribe: (userId: string) => () => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchPending: async (userId: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("pending_transactions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ items: data ?? [], isLoading: false });
  },

  approve: async (pendingId: string, category: string) => {
    const { error } = await supabase.rpc("approve_pending_transaction", {
      p_pending_id: pendingId,
      p_category: category,
    });

    if (error) {
      set({ error: error.message });
      return false;
    }

    set({ items: get().items.filter((item) => item.id !== pendingId) });
    return true;
  },

  reject: async (pendingId: string) => {
    const { error } = await supabase
      .from("pending_transactions")
      .delete()
      .eq("id", pendingId);

    if (error) {
      set({ error: error.message });
      return false;
    }

    set({ items: get().items.filter((item) => item.id !== pendingId) });
    return true;
  },

  subscribe: (userId: string) => {
    const channel = supabase
      .channel(`pending_transactions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pending_transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Simplest correct approach for a low-volume personal inbox:
          // re-fetch rather than hand-patch INSERT/UPDATE/DELETE payloads.
          get().fetchPending(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
