import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BankPickerModal } from "./BankPickerModal";
import { useAuthStore } from "../store/authStore";
import { useBankAccountsStore } from "../store/bankAccountsStore";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AccountsModal({ visible, onClose }: Props) {
  const userId = useAuthStore((state) => state.session?.user.id);
  const accounts = useBankAccountsStore((state) => state.items);
  const addBankAccount = useBankAccountsStore((state) => state.addBankAccount);
  const deleteBankAccount = useBankAccountsStore((state) => state.deleteBankAccount);

  const [bankName, setBankName] = useState("");
  const [alias, setAlias] = useState("");
  const [bankPickerVisible, setBankPickerVisible] = useState(false);

  const handleAdd = async () => {
    if (!userId || !bankName || !alias.trim()) return;
    const success = await addBankAccount(userId, bankName, alias.trim());
    if (success) {
      setBankName("");
      setAlias("");
    } else {
      Alert.alert("Couldn't add account", "Something went wrong — please try again.");
    }
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert("Delete account?", `"${label}" won't affect transactions already tagged with it.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteBankAccount(id) },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Bank Accounts</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            {accounts.length === 0 && (
              <Text style={styles.emptyText}>No accounts yet — add your first one below.</Text>
            )}
            {accounts.map((account) => (
              <View key={account.id} style={styles.row}>
                <View style={styles.rowLabel}>
                  <Text style={styles.rowText}>{account.bank_name}</Text>
                  <Text style={styles.rowSubtext}>{account.account_alias}</Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() => handleDelete(account.id, `${account.bank_name} — ${account.account_alias}`)}
                >
                  <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                </Pressable>
              </View>
            ))}

            <View style={styles.addRow}>
              <Pressable style={styles.bankInput} onPress={() => setBankPickerVisible(true)}>
                <Text style={bankName ? styles.bankInputText : styles.bankPlaceholderText}>
                  {bankName || "Choose a bank"}
                </Text>
              </Pressable>
              <TextInput
                style={styles.aliasInput}
                placeholder="Alias, e.g. Main Debit"
                value={alias}
                onChangeText={setAlias}
                onSubmitEditing={handleAdd}
              />
              <Pressable style={styles.addButton} onPress={handleAdd}>
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>

      <BankPickerModal
        visible={bankPickerVisible}
        onSelect={(bank) => {
          setBankName(bank);
          setBankPickerVisible(false);
        }}
        onClose={() => setBankPickerVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  done: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4f46e5",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    paddingVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowLabel: {
    flex: 1,
  },
  rowText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  rowSubtext: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  addRow: {
    marginTop: 12,
    gap: 8,
  },
  bankInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
  },
  bankInputText: {
    fontSize: 14,
    color: "#111827",
  },
  bankPlaceholderText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  aliasInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: {
    alignSelf: "flex-end",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
});
