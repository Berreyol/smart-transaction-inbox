// ============================================================================
// Auth state. Wraps Supabase's session/auth-state-change machinery in a
// Zustand store so any screen can read the current user without prop
// drilling, and so App.tsx has a single place to trigger push-token
// registration whenever a session appears.
// ============================================================================
import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  isInitializing: boolean;
  isSubmitting: boolean;
  error: string | null;
  /** Loads the current session and subscribes to future auth changes. Call once, at app startup. */
  initialize: () => void;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isInitializing: true,
  isSubmitting: false,
  error: null,

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, isInitializing: false });
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isInitializing: false });
    });
  },

  signInWithEmail: async (email, password) => {
    set({ isSubmitting: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ isSubmitting: false, error: error?.message ?? null });
    return !error;
  },

  signUpWithEmail: async (email, password) => {
    set({ isSubmitting: true, error: null });
    const { error } = await supabase.auth.signUp({ email, password });
    set({ isSubmitting: false, error: error?.message ?? null });
    return !error;
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
