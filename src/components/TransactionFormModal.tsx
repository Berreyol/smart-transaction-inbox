import { useEffect, useState } from "react";
import {
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
import { BankAccountPickerModal } from "./BankAccountPickerModal";
import { CategoryModal } from "./CategoryModal";
import { useBankAccountsStore } from "../store/bankAccountsStore";
import { useCategoriesStore } from "../store/categoriesStore";
import type { TransactionInput } from "../store/transactionsStore";
import type { Transaction, TransactionType } from "../types/database";

interface Props {
  visible: boolean;
  /** null means "create a new transaction"; a Transaction means "edit this one". */
  transaction: Transaction | null;
  onSubmit: (input: TransactionInput) => Promise<boolean>;
  onClose: () => void;
}

export function TransactionFormModal({ visible, transaction, onSubmit, onClose }: Props) {
  const categories = useCategoriesStore((state) => state.items);
  const bankAccounts = useBankAccountsStore((state) => state.items);

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [accountPickerVisible, setAccountPickerVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setType(transaction?.type ?? "expense");
    setAmount(transaction ? String(transaction.amount) : "");
    setCategory(transaction?.category ?? "");
    setMerchant(transaction?.merchant ?? "");
    setAccountId(transaction?.account_id ?? null);
    setError(null);
  }, [visible, transaction]);

  const selectedAccount = bankAccounts.find((account) => account.id === accountId) ?? null;

  const handleTypeChange = (next: TransactionType) => {
    setType(next);
    setCategory("");
  };

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    if (!category) {
      setError("Choose a category.");
      return;
    }

    setSubmitting(true);
    const success = await onSubmit({
      amount: parsedAmount,
      type,
      category,
      merchant: merchant.trim() || null,
      account_id: accountId,
    });
    setSubmitting(false);

    if (success) onClose();
    else setError("Something went wrong — please try again.");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdropTouchable} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{transaction ? "Edit transaction" : "New transaction"}</Text>

          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeOption, type === "expense" && styles.typeOptionActive]}
              onPress={() => handleTypeChange("expense")}
            >
              <Text style={[styles.typeText, type === "expense" && styles.typeTextActive]}>
                Expense
              </Text>
            </Pressable>
            <Pressable
              style={[styles.typeOption, type === "income" && styles.typeOptionActive]}
              onPress={() => handleTypeChange("income")}
            >
              <Text style={[styles.typeText, type === "income" && styles.typeTextActive]}>
                Income
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={styles.label}>Category</Text>
          <Pressable style={styles.input} onPress={() => setCategoryPickerVisible(true)}>
            <Text style={category ? styles.inputText : styles.placeholderText}>
              {category || "Choose a category"}
            </Text>
          </Pressable>

          <Text style={styles.label}>Merchant (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Trader Joe's"
            value={merchant}
            onChangeText={setMerchant}
          />

          {bankAccounts.length > 0 && (
            <>
              <Text style={styles.label}>Account (optional)</Text>
              <Pressable style={styles.input} onPress={() => setAccountPickerVisible(true)}>
                <Text style={selectedAccount ? styles.inputText : styles.placeholderText}>
                  {selectedAccount ? selectedAccount.account_alias : "No account"}
                </Text>
              </Pressable>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.submit, submitting && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? "Saving…" : transaction ? "Save changes" : "Add transaction"}
            </Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      <CategoryModal
        visible={categoryPickerVisible}
        type={type}
        categories={categories}
        onSelect={(name) => {
          setCategory(name);
          setCategoryPickerVisible(false);
        }}
        onClose={() => setCategoryPickerVisible(false)}
      />

      <BankAccountPickerModal
        visible={accountPickerVisible}
        accounts={bankAccounts}
        onSelect={(id) => {
          setAccountId(id);
          setAccountPickerVisible(false);
        }}
        onClose={() => setAccountPickerVisible(false)}
      />
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
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  typeOptionActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  typeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeTextActive: {
    color: "#111827",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
    justifyContent: "center",
  },
  inputText: {
    fontSize: 15,
    color: "#111827",
  },
  placeholderText: {
    fontSize: 15,
    color: "#9ca3af",
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    marginBottom: 8,
  },
  submit: {
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  cancel: {
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "600",
  },
});
