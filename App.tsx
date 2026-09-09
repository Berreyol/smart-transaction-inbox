import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { loadCachedLanguage } from "./src/i18n";
import { AuthScreen } from "./src/screens/AuthScreen";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAuthStore } from "./src/store/authStore";
import { registerAndSavePushToken } from "./src/utils/notifications";

export default function App() {
  const { session, isInitializing, initialize } = useAuthStore();
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Applies the last locally-cached language choice before first render, so
  // a returning user doesn't see a flash of the device-default language
  // while profiles.language (the cross-device source of truth) is still
  // being fetched — see profileStore.fetchProfile.
  useEffect(() => {
    loadCachedLanguage().finally(() => setIsLanguageReady(true));
  }, []);

  // Register this device for push notifications whenever a session appears
  // (fresh login or a restored session on app launch).
  useEffect(() => {
    if (session?.user.id) {
      registerAndSavePushToken(session.user.id);
    }
  }, [session?.user.id]);

  if (isInitializing || !isLanguageReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardProvider>
      {session ? <RootNavigator /> : <AuthScreen />}
      <StatusBar style="auto" />
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
