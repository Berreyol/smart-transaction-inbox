import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { TransactionListItem } from "../components/TransactionListItem";
import { useAuthStore } from "../store/authStore";
import { useTransactionsStore } from "../store/transactionsStore";
import type { Transaction, TransactionType } from "../types/database";

type ViewMode = "type" | "category";

const VIEW_LABELS: Record<ViewMode, string> = {
  type: "Income vs Expense",
  category: "By category",
};

interface CategoryTotal {
  category: string;
  type: TransactionType;
  total: number;
  count: number;
}

function CategoryTotalRow({ total }: { total: CategoryTotal }) {
  const isIncome = total.type === "income";
  return (
    <View style={styles.categoryRow}>
      <View>
        <Text style={styles.categoryName}>{total.category}</Text>
        <Text style={styles.categoryMeta}>
          {total.count} transaction{total.count === 1 ? "" : "s"}
        </Text>
      </View>
      <Text style={[styles.categoryAmount, isIncome ? styles.amountIncome : styles.amountExpense]}>
        {isIncome ? "+" : "-"}${total.total.toFixed(2)}
      </Text>
    </View>
  );
}

export function DashboardScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { items, isLoading, fetchTransactions, subscribe } = useTransactionsStore();
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchTransactions(userId);
    const unsubscribe = subscribe(userId);
    return unsubscribe;
  }, [userId, fetchTransactions, subscribe]);

  const { totalIncome, totalExpenses } = useMemo(() => {
    return items.reduce(
      (acc, tx) => {
        if (tx.type === "income") {
          acc.totalIncome += tx.amount;
        } else {
          acc.totalExpenses += tx.amount;
        }
        return acc;
      },
      { totalIncome: 0, totalExpenses: 0 },
    );
  }, [items]);

  const categoryTotals = useMemo<CategoryTotal[]>(() => {
    const map = new Map<string, CategoryTotal>();
    for (const tx of items) {
      const key = `${tx.type}:${tx.category}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += tx.amount;
        existing.count += 1;
      } else {
        map.set(key, { category: tx.category, type: tx.type, total: tx.amount, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [items]);

  const refreshControl = (
    <RefreshControl refreshing={isLoading} onRefresh={() => userId && fetchTransactions(userId)} />
  );

  const emptyComponent = (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No transactions yet</Text>
      <Text style={styles.emptySubtitle}>Approved transactions from your Inbox will show up here.</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.viewSwitcher} onPress={() => setMenuVisible(true)}>
        <Text style={styles.viewSwitcherText}>{VIEW_LABELS[viewMode]}</Text>
        <Ionicons name="chevron-down" size={16} color="#4f46e5" />
      </Pressable>

      {viewMode === "type" ? (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={items.length === 0 && styles.emptyContainer}
          refreshControl={refreshControl}
          ListHeaderComponent={
            items.length > 0 ? (
              <IncomeExpenseChart totalIncome={totalIncome} totalExpenses={totalExpenses} />
            ) : null
          }
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }: { item: Transaction }) => <TransactionListItem transaction={item} />}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={categoryTotals}
          keyExtractor={(item) => `${item.type}:${item.category}`}
          contentContainerStyle={categoryTotals.length === 0 && styles.emptyContainer}
          refreshControl={refreshControl}
          ListHeaderComponent={
            categoryTotals.length > 0 ? (
              <Text style={styles.categoryHeader}>Totals by category</Text>
            ) : null
          }
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }) => <CategoryTotalRow total={item} />}
        />
      )}

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={styles.menu}>
            {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
              <Pressable
                key={mode}
                style={styles.menuOption}
                onPress={() => {
                  setViewMode(mode);
                  setMenuVisible(false);
                }}
              >
                <Text style={[styles.menuOptionText, viewMode === mode && styles.menuOptionTextActive]}>
                  {VIEW_LABELS[mode]}
                </Text>
                {viewMode === mode && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  list: {
    flex: 1,
  },
  viewSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#eef2ff",
  },
  viewSwitcherText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4f46e5",
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  categoryHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  categoryMeta: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  amountIncome: {
    color: "#16a34a",
  },
  amountExpense: {
    color: "#dc2626",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    padding: 16,
    paddingTop: 100,
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    minWidth: 220,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  menuOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuOptionText: {
    fontSize: 15,
    color: "#111827",
  },
  menuOptionTextActive: {
    color: "#4f46e5",
    fontWeight: "600",
  },
});
