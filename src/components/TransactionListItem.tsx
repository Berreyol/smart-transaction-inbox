import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Transaction } from "../types/database";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface Props {
  transaction: Transaction;
  onPress?: () => void;
  onDelete?: () => void;
}

export function TransactionListItem({ transaction, onPress, onDelete }: Props) {
  const isIncome = transaction.type === "income";
  const sign = isIncome ? "+" : "-";

  const row = (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.merchant} numberOfLines={1}>
          {transaction.merchant || transaction.category}
        </Text>
        <Text style={styles.meta}>
          {transaction.category} · {formatDate(transaction.date)}
        </Text>
      </View>
      <Text style={[styles.amount, isIncome ? styles.amountIncome : styles.amountExpense]}>
        {sign}${transaction.amount.toFixed(2)}
      </Text>
      {onDelete && (
        <Pressable hitSlop={10} style={styles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color="#9ca3af" />
        </Pressable>
      )}
    </View>
  );

  if (!onPress) return row;
  return <Pressable onPress={onPress}>{row}</Pressable>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  merchant: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  meta: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
    textTransform: "capitalize",
  },
  amount: {
    fontSize: 15,
    fontWeight: "700",
  },
  amountIncome: {
    color: "#16a34a",
  },
  amountExpense: {
    color: "#dc2626",
  },
  deleteButton: {
    marginLeft: 12,
  },
});
