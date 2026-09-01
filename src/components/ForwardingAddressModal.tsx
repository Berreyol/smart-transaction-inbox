import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useProfileStore } from "../store/profileStore";
import { buildForwardingAddress } from "../utils/forwardingAddress";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ForwardingAddressModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const profile = useProfileStore((state) => state.profile);
  const address = profile
    ? buildForwardingAddress(process.env.EXPO_PUBLIC_INBOUND_EMAIL_ADDRESS, profile.forwarding_token)
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t("forwardingAddress.title")}</Text>
          <Text style={styles.body}>{t("forwardingAddress.body")}</Text>

          {address ? (
            <Text selectable style={styles.address}>
              {address}
            </Text>
          ) : profile ? (
            <>
              <Text selectable style={styles.address}>
                {profile.forwarding_token}
              </Text>
              <Text style={styles.hint}>
                {t("forwardingAddress.hint", { token: profile.forwarding_token })}
              </Text>
            </>
          ) : (
            <Text style={styles.hint}>{t("common.loading")}</Text>
          )}

          <Pressable style={styles.done} onPress={onClose}>
            <Text style={styles.doneText}>{t("common.done")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  address: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4f46e5",
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
    lineHeight: 17,
  },
  done: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  doneText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
