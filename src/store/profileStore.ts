// ============================================================================
// State for the current user's own profile row. Currently just backs the
// "your forwarding address" display (ForwardingAddressModal) — the
// forwarding_token it reads is what identifies the user in parse-email's
// `to`-address lookup instead of the (forwarding-fragile) From header.
// ============================================================================
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/database";

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  fetchProfile: (userId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  isLoading: false,
  error: null,

  fetchProfile: async (userId: string) => {
    set({ isLoading: true, error: null });
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

    if (error) {
      set({ isLoading: false, error: error.message });
      return;
    }
    set({ profile: data, isLoading: false });
  },
}));
