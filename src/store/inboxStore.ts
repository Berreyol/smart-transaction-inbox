// ============================================================================
// State for the Smart Transaction Inbox: the list of pending_transactions
// awaiting user review, plus approve/reject/update actions.
//
// Approve calls the `approve_pending_transaction` RPC (see
// supabase/migrations/0002_approve_pending_transaction.sql) so the move into
// `transactions` and the removal from `pending_transactions` happen as one
// atomic server-side operation. Reject is a plain delete — nothing else
// depends on that row existing. Update lets the user correct amount/type/
// merchant before approving (e.g. when the parser couldn't confidently
// extract them) — this is a plain UPDATE under the existing "Users can
// update own pending transactions" RLS policy (see 0001_init.sql), not a new
// mutation path, and intentionally not folded into approve_pending_transaction
// since an edit that saves but isn't immediately approved is still a valid,
// non-corrupt state (unlike the insert+delete pair approve makes atomic).
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { PendingTransaction, PendingTransactionEdits } from "../types/database";

interface InboxState {
  items: PendingTransaction[];
  /** merchant_key -> last category chosen for that merchant, from merchant_category_map. */
  suggestions: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  fetchPending: (userId: string) => Promise<void>;
  fetchSuggestions: (userId: string) => Promise<void>;
  approve: (pendingId: string, category: string, accountId: string | null) => Promise<boolean>;
  reject: (pendingId: string) => Promise<boolean>;
  update: (pendingId: string, edits: PendingTransactionEdits) => Promise<boolean>;
  /** Subscribes to realtime changes on this user's pending queue. Returns an unsubscribe function. */
  subscribe: (userId: string) => () => void;
}

export const useInboxStore = create<InboxState>((set, get) => ({
  items: [],
  suggestions: {},
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

  fetchSuggestions: async (userId: string) => {
    const { data, error } = await supabase
      .from("merchant_category_map")
      .select("merchant_key, category")
      .eq("user_id", userId);

    if (error || !data) return;

    const suggestions: Record<string, string> = {};
    for (const row of data) {
      suggestions[row.merchant_key] = row.category;
    }
    set({ suggestions });
  },

  approve: async (pendingId: string, category: string, accountId: string | null) => {
    const approvedItem = get().items.find((item) => item.id === pendingId);
    const { error } = await supabase.rpc("approve_pending_transaction", {
      p_pending_id: pendingId,
      p_category: category,
      p_account_id: accountId,
    });

    if (error) {
      set({ error: error.message });
      return false;
    }

    set({ items: get().items.filter((item) => item.id !== pendingId) });
    // Approving just upserted merchant_category_map server-side (see
    // approve_pending_transaction) — refresh so the next matching pending
    // transaction picks up the new/updated suggestion.
    if (approvedItem) {
      get().fetchSuggestions(approvedItem.user_id);
    }
    return true;
  },

  update: async (pendingId: string, edits: PendingTransactionEdits) => {
    const { data, error } = await supabase
      .from("pending_transactions")
      .update(edits)
      .eq("id", pendingId)
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }

    set({ items: get().items.map((item) => (item.id === pendingId ? data : item)) });
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
