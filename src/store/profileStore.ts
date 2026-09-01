// ============================================================================
// State for the current user's own profile row. Backs the "your forwarding
// address" display (ForwardingAddressModal) — the forwarding_token it reads
// is what identifies the user in parse-email, read out of the
// X-Forwarded-To header — and the language preference (SettingsScreen),
// which is display-only and never reaches parse-email at all.
// ============================================================================
import { create } from "zustand";
import { applyLanguagePreference } from "../i18n";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types/database";

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  fetchProfile: (userId: string) => Promise<void>;
  updateLanguage: (userId: string, language: string | null) => Promise<void>;
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
    await applyLanguagePreference(data.language);
  },

  updateLanguage: async (userId: string, language: string | null) => {
    await applyLanguagePreference(language);
    const { data, error } = await supabase
      .from("profiles")
      .update({ language })
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      set({ error: error.message });
      return;
    }
    set({ profile: data });
  },
}));
