import { Modal, Pressable, StyleSheet, Text } from "react-native";
import type { BankAccount } from "../types/database";

interface Props {
  visible: boolean;
  accounts: BankAccount[];
  onSelect: (accountId: string | null) => void;
  onClose: () => void;
}

export function BankAccountPickerModal({ visible, accounts, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Assign to an account</Text>
          <Text style={styles.subtitle}>Optional — you can skip this and add it later.</Text>

          <Pressable style={styles.option} onPress={() => onSelect(null)}>
            <Text style={styles.optionText}>No account</Text>
          </Pressable>
          {accounts.map((account) => (
            <Pressable key={account.id} style={styles.option} onPress={() => onSelect(account.id)}>
              <Text style={styles.optionText}>{account.bank_name}</Text>
              <Text style={styles.optionSubtext}>{account.account_alias}</Text>
            </Pressable>
          ))}

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
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
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
    marginBottom: 12,
  },
  option: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  optionText: {
    fontSize: 16,
    color: "#111827",
  },
  optionSubtext: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  cancel: {
    paddingVertical: 14,
    marginTop: 4,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#dc2626",
    fontWeight: "600",
  },
});
