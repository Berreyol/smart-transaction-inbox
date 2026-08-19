import { useEffect, useMemo } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { TransactionListItem } from "../components/TransactionListItem";
import { useAuthStore } from "../store/authStore";
import { useTransactionsStore } from "../store/transactionsStore";

export function DashboardScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { items, isLoading, fetchTransactions, subscribe } = useTransactionsStore();

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

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length === 0 && styles.emptyContainer}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={() => userId && fetchTransactions(userId)} />
      }
      ListHeaderComponent={
        items.length > 0 ? (
          <IncomeExpenseChart totalIncome={totalIncome} totalExpenses={totalExpenses} />
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No transactions yet</Text>
          <Text style={styles.emptySubtitle}>
            Approved transactions from your Inbox will show up here.
          </Text>
        </View>
      }
      renderItem={({ item }) => <TransactionListItem transaction={item} />}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
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
});
