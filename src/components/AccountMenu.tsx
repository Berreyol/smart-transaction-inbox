import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../store/authStore";
import { ForwardingAddressModal } from "./ForwardingAddressModal";

const LINKEDIN_URL = process.env.EXPO_PUBLIC_LINKEDIN_URL;
const GITHUB_REPO_URL = process.env.EXPO_PUBLIC_GITHUB_REPO_URL;

export function AccountMenu() {
  const signOut = useAuthStore((state) => state.signOut);
  const [menuVisible, setMenuVisible] = useState(false);
  const [addressVisible, setAddressVisible] = useState(false);

  const openForwardingAddress = () => {
    setMenuVisible(false);
    setAddressVisible(true);
  };

  const openLinkedIn = () => {
    setMenuVisible(false);
    if (LINKEDIN_URL) Linking.openURL(LINKEDIN_URL);
  };

  const openGitHub = () => {
    setMenuVisible(false);
    if (GITHUB_REPO_URL) Linking.openURL(GITHUB_REPO_URL);
  };

  const handleSignOut = () => {
    setMenuVisible(false);
    signOut();
  };

  return (
    <View style={{ marginRight: 16 }}>
      <Pressable onPress={() => setMenuVisible(true)} hitSlop={12}>
        <Ionicons name="person-circle-outline" size={30} color="#4f46e5" />
      </Pressable>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menu}>
            <Pressable style={styles.row} onPress={openForwardingAddress}>
              <Ionicons name="at-outline" size={20} color="#4f46e5" />
              <Text style={styles.rowText}>Forwarding address</Text>
            </Pressable>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>About me</Text>
            <Pressable style={styles.row} onPress={openLinkedIn}>
              <Ionicons name="logo-linkedin" size={20} color="#4f46e5" />
              <Text style={styles.rowText}>Connect on LinkedIn</Text>
            </Pressable>

            <Pressable style={styles.row} onPress={openGitHub}>
              <Ionicons name="logo-github" size={20} color="#4f46e5" />
              <Text style={styles.rowText}>Contribute on GitHub</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable style={styles.row} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
              <Text style={[styles.rowText, styles.signOutText]}>Sign Out</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ForwardingAddressModal visible={addressVisible} onClose={() => setAddressVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "flex-end",
    paddingTop: 64,
    paddingRight: 12,
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 240,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  signOutText: {
    color: "#dc2626",
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 2,
  },
});
