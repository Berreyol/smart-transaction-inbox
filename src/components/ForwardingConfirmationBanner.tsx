import { useTranslation } from "react-i18next";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useForwardingConfirmationStore } from "../store/forwardingConfirmationStore";
import type { ForwardingConfirmation } from "../types/database";

interface Props {
  item: ForwardingConfirmation;
}

/**
 * Shown when the handle-forwarding-confirmation edge function couldn't
 * auto-confirm a Gmail forwarding setup request server-side (see that
 * function's comments for why the URL here is safe to open — it's already
 * been verified as genuinely hosted on mail.google.com).
 */
export function ForwardingConfirmationBanner({ item }: Props) {
  const { t } = useTranslation();
  const resolve = useForwardingConfirmationStore((state) => state.resolve);

  const handleConfirm = async () => {
    await Linking.openURL(item.confirmation_url);
    resolve(item.id, "manually_confirmed");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("forwardingConfirmation.title")}</Text>
      <Text style={styles.body}>
        {item.source_email
          ? t("forwardingConfirmation.bodyWithEmail", { email: item.source_email })
          : t("forwardingConfirmation.body")}
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.dismiss} onPress={() => resolve(item.id, "dismissed")}>
          <Text style={styles.dismissText}>{t("common.dismiss")}</Text>
        </Pressable>
        <Pressable style={styles.confirm} onPress={handleConfirm}>
          <Text style={styles.confirmText}>{t("forwardingConfirmation.confirmButton")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#eef2ff",
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#312e81",
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    color: "#4338ca",
    lineHeight: 18,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  dismiss: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dismissText: {
    color: "#6366f1",
    fontWeight: "600",
    fontSize: 13,
  },
  confirm: {
    backgroundColor: "#4f46e5",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  confirmText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
