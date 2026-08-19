import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PendingTransaction } from "../types/database";

const RAW_TEXT_SNIPPET_LENGTH = 140;

function formatAmount(amount: number | null): string {
  return amount === null ? "Amount not detected" : `$${amount.toFixed(2)}`;
}

interface Props {
  item: PendingTransaction;
  onApprove: () => void;
  onReject: () => void;
}

export function PendingTransactionCard({ item, onApprove, onReject }: Props) {
  const canApprove = item.amount !== null && item.type !== null;
  const snippet =
    item.raw_text.length > RAW_TEXT_SNIPPET_LENGTH
      ? `${item.raw_text.slice(0, RAW_TEXT_SNIPPET_LENGTH).trim()}…`
      : item.raw_text;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
        {item.type && (
          <View style={[styles.badge, item.type === "income" ? styles.badgeIncome : styles.badgeExpense]}>
            <Text style={styles.badgeText}>{item.type === "income" ? "Income" : "Expense"}</Text>
          </View>
        )}
      </View>

      {item.bank_name && <Text style={styles.bankName}>{item.bank_name}</Text>}
      {item.merchant && <Text style={styles.merchant}>{item.merchant}</Text>}

      <Text style={styles.snippet} numberOfLines={3}>
        {snippet}
      </Text>

      {!canApprove && (
        <Text style={styles.warning}>
          Couldn't detect the amount or type — reject this and enter it manually.
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.rejectButton]} onPress={onReject}>
          <Text style={styles.rejectButtonText}>Reject</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.approveButton, !canApprove && styles.buttonDisabled]}
          onPress={onApprove}
          disabled={!canApprove}
        >
          <Text style={styles.approveButtonText}>Approve</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  amount: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeIncome: {
    backgroundColor: "#dcfce7",
  },
  badgeExpense: {
    backgroundColor: "#fee2e2",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  bankName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4f46e5",
    textTransform: "uppercase",
    marginTop: 8,
  },
  merchant: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginTop: 6,
  },
  snippet: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 6,
    lineHeight: 18,
  },
  warning: {
    fontSize: 12,
    color: "#b45309",
    marginTop: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  rejectButton: {
    backgroundColor: "#f3f4f6",
  },
  rejectButtonText: {
    color: "#374151",
    fontWeight: "600",
  },
  approveButton: {
    backgroundColor: "#4f46e5",
  },
  approveButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
