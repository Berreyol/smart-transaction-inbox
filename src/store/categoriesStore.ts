// ============================================================================
// State for user-owned transaction categories (src/utils/categories.ts holds
// the pure filter helper; this store owns fetching/CRUD/realtime).
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Category, TransactionType } from "../types/database";

let subscriberCount = 0;
let teardownChannel: (() => void) | null = null;

interface CategoriesState {
  items: Category[];
  isLoading: boolean;
  error: string | null;
  fetchCategories: (userId: string) => Promise<void>;
  addCategory: (userId: string, name: string, type: TransactionType) => Promise<boolean>;
  renameCategory: (id: string, name: string) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  /** Subscribes to realtime changes on this user's categories. Returns an unsubscribe function. */
  subscribe: (userId: string) => () => void;
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetchCategories: async (userId: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("name", { ascending: true });

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ items: data ?? [], isLoading: false });
  },

  addCategory: async (userId: string, name: string, type: TransactionType) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name: trimmed, type })
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: [...get().items, data] });
    return true;
  },

  renameCategory: async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const { data, error } = await supabase
      .from("categories")
      .update({ name: trimmed })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: get().items.map((c) => (c.id === id ? data : c)) });
    return true;
  },

  deleteCategory: async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ items: get().items.filter((c) => c.id !== id) });
    return true;
  },

  subscribe: (userId: string) => {
    // InboxScreen and TransactionsScreen both subscribe to this store, so
    // ref-count the underlying channel (see transactionsStore.ts for why a
    // second `.channel()` call on the same topic can't just be repeated).
    subscriberCount += 1;
    if (!teardownChannel) {
      const channel = supabase
        .channel(`categories:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "categories",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            get().fetchCategories(userId);
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
