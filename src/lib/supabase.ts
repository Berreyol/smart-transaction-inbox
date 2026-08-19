// ============================================================================
// Supabase client singleton for the React Native app.
//
// Two things React Native needs that a web app gets for free:
//   1. `react-native-url-polyfill` — RN's JS engine lacks a full `URL`
//      implementation, which supabase-js relies on internally.
//   2. AsyncStorage as the auth storage adapter — so the session survives
//      app restarts (there's no browser localStorage on-device).
// ============================================================================
import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your Supabase project values.",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // RN has no URL-based OAuth redirect flow to detect on load.
    detectSessionInUrl: false,
  },
});
