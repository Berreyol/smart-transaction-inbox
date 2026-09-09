// ============================================================================
// State for pending Gmail auto-forward confirmations. Rows are created by
// parse-email's forwarding-confirmation branch when a user sets up mail
// forwarding to their personalized address (see migration 0014 and that
// function's index.ts for the full flow, including why the confirmation URL
// is safe to fetch/display). Most confirmations resolve automatically
// server-side; this store only ever surfaces ones still 'pending', so the
// user can tap through Google's confirmation link themselves.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { ForwardingConfirmation } from "../types/database";

interface ForwardingConfirmationState {
  items: ForwardingConfirmation[];
  fetchPending: (userId: string) => Promise<void>;
  resolve: (id: string, status: "manually_confirmed" | "dismissed") => Promise<void>;
  /** Subscribes to realtime changes on this user's forwarding confirmations. Returns an unsubscribe function. */
  subscribe: (userId: string) => () => void;
}

export const useForwardingConfirmationStore = create<ForwardingConfirmationState>((set, get) => ({
  items: [],

  fetchPending: async (userId: string) => {
    const { data, error } = await supabase
      .from("forwarding_confirmations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error || !data) return;
    set({ items: data });
  },

  resolve: async (id: string, status: "manually_confirmed" | "dismissed") => {
    const { error } = await supabase.from("forwarding_confirmations").update({ status }).eq("id", id);
    if (error) return;
    set({ items: get().items.filter((item) => item.id !== id) });
  },

  subscribe: (userId: string) => {
    const channel = supabase
      .channel(`forwarding_confirmations:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "forwarding_confirmations",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          get().fetchPending(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
