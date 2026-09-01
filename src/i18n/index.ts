// ============================================================================
// i18n setup. Language selection is purely a display concern — nothing here
// is read by supabase/functions/parse-email/parser.ts, which stays
// English-regex-only regardless of the app's UI language.
//
// Resolution order for the language shown before the user has ever picked
// one: last locally-cached choice (AsyncStorage) > device locale (if it's
// one we support) > English. Once a user does pick a language, it's also
// written to profiles.language so it follows them across devices/reinstalls
// (see profileStore.updateLanguage) — the local cache just avoids a flash of
// the wrong language while that row is still being fetched on cold start.
// ============================================================================
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = "app-language";

function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function resolveDeviceLanguage(): SupportedLanguage {
  const deviceCode = Localization.getLocales()[0]?.languageCode;
  return isSupportedLanguage(deviceCode) ? deviceCode : "en";
}

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: resolveDeviceLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

/** Applies the locally-cached language choice, if any, ahead of the profile fetch. Call once on app start. */
export async function loadCachedLanguage(): Promise<void> {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(stored) && stored !== i18next.language) {
    await i18next.changeLanguage(stored);
  }
}

/** Switches the UI language and caches the choice; pass null to fall back to the device locale. */
export async function applyLanguagePreference(language: string | null): Promise<void> {
  const resolved = isSupportedLanguage(language) ? language : resolveDeviceLanguage();
  await i18next.changeLanguage(resolved);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, resolved);
}

export default i18next;
