import { useEffect, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { PendingTransaction, PendingTransactionEdits, TransactionType } from "../types/database";

interface Props {
  item: PendingTransaction | null;
  onSave: (edits: PendingTransactionEdits) => void;
  onClose: () => void;
}

// iOS's "decimal-pad" keyboard has no built-in Done/Return key, so without
// this there's no way to dismiss it short of force-closing the modal.
// InputAccessoryView is iOS-only (unsupported on Android, which doesn't need
// it — its numeric keyboards include a dismiss affordance already).
const AMOUNT_ACCESSORY_ID = "edit-pending-amount-accessory";

export function EditPendingTransactionModal({ item, onSave, onClose }: Props) {
  const [amountText, setAmountText] = useState("");
  const [type, setType] = useState<TransactionType | null>(null);
  const [merchant, setMerchant] = useState("");
  const [amountError, setAmountError] = useState(false);

  // Re-seed local state from the item every time a new one is opened for
  // editing, since this modal instance stays mounted across items.
  useEffect(() => {
    if (!item) return;
    setAmountText(item.amount !== null ? String(item.amount) : "");
    setType(item.type);
    setMerchant(item.merchant ?? "");
    setAmountError(false);
  }, [item]);

  const handleSave = () => {
    const trimmedAmount = amountText.trim();
    let amount: number | null = null;
    if (trimmedAmount !== "") {
      amount = Number(trimmedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setAmountError(true);
        return;
      }
    }
    onSave({ amount, type, merchant: merchant.trim() || null });
  };

  return (
    <Modal visible={item !== null} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.backdropTouchable} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Edit transaction</Text>

          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={[styles.input, amountError && styles.inputError]}
            value={amountText}
            onChangeText={(text) => {
              setAmountText(text);
              setAmountError(false);
            }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            inputAccessoryViewID={Platform.OS === "ios" ? AMOUNT_ACCESSORY_ID : undefined}
          />
          {amountError && <Text style={styles.errorText}>Enter a valid amount</Text>}
          {Platform.OS === "ios" && (
            <InputAccessoryView nativeID={AMOUNT_ACCESSORY_ID}>
              <View style={styles.accessory}>
                <Pressable onPress={() => Keyboard.dismiss()}>
                  <Text style={styles.accessoryDone}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          )}

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeButton, type === "expense" && styles.typeButtonSelectedExpense]}
              onPress={() => setType("expense")}
            >
              <Text style={[styles.typeButtonText, type === "expense" && styles.typeButtonTextSelected]}>
                Expense
              </Text>
            </Pressable>
            <Pressable
              style={[styles.typeButton, type === "income" && styles.typeButtonSelectedIncome]}
              onPress={() => setType("income")}
            >
              <Text style={[styles.typeButtonText, type === "income" && styles.typeButtonTextSelected]}>
                Income
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Merchant</Text>
          <TextInput
            style={styles.input}
            value={merchant}
            onChangeText={setMerchant}
            placeholder="Merchant name"
          />

          <Pressable style={styles.save} onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropTouchable: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
  },
  inputError: {
    borderColor: "#dc2626",
  },
  errorText: {
    fontSize: 12,
    color: "#dc2626",
    marginTop: 4,
  },
  typeRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  typeButtonSelectedExpense: {
    backgroundColor: "#fee2e2",
    borderColor: "#fee2e2",
  },
  typeButtonSelectedIncome: {
    backgroundColor: "#dcfce7",
    borderColor: "#dcfce7",
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeButtonTextSelected: {
    color: "#111827",
  },
  save: {
    backgroundColor: "#4f46e5",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  saveText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  cancel: {
    paddingVertical: 14,
    marginTop: 4,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#6b7280",
    fontWeight: "600",
  },
  accessory: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f3f4f6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d1d5db",
  },
  accessoryDone: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4f46e5",
  },
});
