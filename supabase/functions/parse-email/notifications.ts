// ============================================================================
// Push notifications for parse-email's two branches. A failed push should
// never fail the webhook itself — whatever it was notifying about (a stored
// transaction, a forwarding confirmation) already succeeded and is
// reviewable in-app regardless.
// ============================================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPushNotification(pushToken: string, title: string, body: string) {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: { screen: "Inbox" },
      }),
    });
    if (!res.ok) {
      console.error("Expo push request failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Expo push error:", err);
  }
}
