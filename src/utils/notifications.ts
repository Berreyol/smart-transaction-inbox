// ============================================================================
// Expo push notification registration.
//
// IMPORTANT: as of Expo SDK 53+, remote push notifications are NOT supported
// in Expo Go — you must run this in a development build
// (`eas build --profile development` or `npx expo run:android/ios`).
// See: https://docs.expo.dev/develop/development-builds/introduction/
// ============================================================================
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

// Controls how a notification is presented while the app is in the
// foreground. Without this, foreground pushes are silently swallowed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests notification permissions and returns this device's Expo push
 * token, or null if permissions were denied or we're on a simulator/web
 * (push tokens require a physical device).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn("Push notifications require a physical device; skipping registration.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("Push notification permission denied.");
    return null;
  }

  // EAS project ID is required to mint an Expo push token from SDK 49+.
  // Set via `eas init`, which writes it to app.json's extra.eas.projectId.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    console.error(
      "Missing EAS projectId. Run `eas init` to link this app to an EAS project " +
        "before push notifications can be registered.",
    );
    return null;
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

/** Persists the device's Expo push token on the current user's profile row. */
export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ expo_push_token: token })
    .eq("id", userId);

  if (error) {
    console.error("Failed to save push token:", error.message);
  }
}

/**
 * Convenience wrapper for the common case: register this device for push
 * and save the resulting token to the signed-in user's profile. Safe to
 * call on every login — registration is idempotent and errors are logged,
 * not thrown, since a failed push registration shouldn't block sign-in.
 */
export async function registerAndSavePushToken(userId: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await savePushToken(userId, token);
    }
  } catch (err) {
    console.error("Push notification registration failed:", err);
  }
}
