// ============================================================================
// Minimal email/password auth screen.
//
// The email a user signs up with IS the identity the backend matches
// against — it's the address they must forward bank emails from for the
// parse-email edge function to find their profile. Deliberately unstyled
// beyond basics; the Inbox/Dashboard screens get the real design pass.
// ============================================================================
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { applyLanguagePreference, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n";
import { useAuthStore } from "../store/authStore";

export function AuthScreen() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  // null until the new user explicitly picks one, meaning "keep following
  // the device locale" — same convention as Settings' "System default".
  const [signUpLanguage, setSignUpLanguage] = useState<SupportedLanguage | null>(null);
  const { signInWithEmail, signUpWithEmail, isSubmitting, error } = useAuthStore();

  const handleSubmit = () => {
    if (mode === "signIn") {
      signInWithEmail(email.trim(), password);
    } else {
      signUpWithEmail(email.trim(), password, signUpLanguage);
    }
  };

  const handlePickSignUpLanguage = (language: SupportedLanguage) => {
    setSignUpLanguage(language);
    applyLanguagePreference(language);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t("auth.title")}</Text>
      <Text style={styles.subtitle}>
        {mode === "signIn" ? t("auth.subtitleSignIn") : t("auth.subtitleSignUp")}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t("auth.emailPlaceholder")}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t("auth.passwordPlaceholder")}
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      {mode === "signUp" && (
        <View style={styles.languageRow}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const isSelected = (signUpLanguage ?? i18n.language) === language;
            return (
              <Pressable
                key={language}
                style={[styles.languageChip, isSelected && styles.languageChipActive]}
                onPress={() => handlePickSignUpLanguage(language)}
              >
                <Text style={[styles.languageChipText, isSelected && styles.languageChipTextActive]}>
                  {language === "en" ? t("settings.languageEnglish") : t("settings.languageSpanish")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting || !email || !password}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
        <Text style={styles.switchModeText}>
          {mode === "signIn" ? t("auth.switchToSignUp") : t("auth.switchToSignIn")}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#fff",
  },
  logo: {
    width: 96,
    height: 96,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  languageRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  languageChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  languageChipActive: {
    backgroundColor: "#eef2ff",
    borderColor: "#4f46e5",
  },
  languageChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  languageChipTextActive: {
    color: "#4f46e5",
  },
  error: {
    color: "#dc2626",
    marginBottom: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: "#4f46e5",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  switchModeText: {
    color: "#4f46e5",
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
});
