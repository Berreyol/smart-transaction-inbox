import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CategoriesModal } from "../components/CategoriesModal";
import { TransactionFormModal } from "../components/TransactionFormModal";
import { TransactionListItem } from "../components/TransactionListItem";
import { useAuthStore } from "../store/authStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useTransactionsStore } from "../store/transactionsStore";
import type { Transaction, TransactionType } from "../types/database";

type TypeFilter = "all" | TransactionType;
type SortOption = "recent" | "amount_desc" | "amount_asc";

const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  all: "All",
  expense: "Expense",
  income: "Income",
};

const SORT_LABELS: Record<SortOption, string> = {
  recent: "Most recent",
  amount_desc: "Amount: high to low",
  amount_asc: "Amount: low to high",
};

export function TransactionsScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const {
    items,
    isLoading,
    fetchTransactions,
    subscribe,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  } = useTransactionsStore();
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [categoriesVisible, setCategoriesVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchTransactions(userId);
    const unsubscribe = subscribe(userId);
    fetchCategories(userId);
    const unsubscribeCategories = subscribeCategories(userId);
    return () => {
      unsubscribe();
      unsubscribeCategories();
    };
  }, [userId, fetchTransactions, subscribe, fetchCategories, subscribeCategories]);

  const visibleItems = useMemo(() => {
    const filtered = typeFilter === "all" ? items : items.filter((t) => t.type === typeFilter);
    const sorted = [...filtered];
    if (sortBy === "amount_desc") sorted.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "amount_asc") sorted.sort((a, b) => a.amount - b.amount);
    else sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted;
  }, [items, typeFilter, sortBy]);

  const openCreate = () => {
    setEditingTransaction(null);
    setFormVisible(true);
  };

  const openEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormVisible(true);
  };

  const handleDelete = (transaction: Transaction) => {
    Alert.alert("Delete transaction?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteTransaction(transaction.id) },
    ]);
  };

  const handleSubmit = async (input: {
    amount: number;
    type: TransactionType;
    category: string;
    merchant: string | null;
  }) => {
    if (editingTransaction) return updateTransaction(editingTransaction.id, input);
    if (!userId) return false;
    return createTransaction(userId, input);
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.filterRow}>
          {(Object.keys(TYPE_FILTER_LABELS) as TypeFilter[]).map((option) => (
            <Pressable
              key={option}
              style={[styles.chip, typeFilter === option && styles.chipActive]}
              onPress={() => setTypeFilter(option)}
            >
              <Text style={[styles.chipText, typeFilter === option && styles.chipTextActive]}>
                {TYPE_FILTER_LABELS[option]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.toolbarRight}>
          <Pressable style={styles.iconButton} onPress={() => setSortMenuVisible(true)}>
            <Ionicons name="swap-vertical-outline" size={20} color="#4f46e5" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setCategoriesVisible(true)}>
            <Ionicons name="pricetags-outline" size={20} color="#4f46e5" />
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          visibleItems.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => userId && fetchTransactions(userId)} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No transactions</Text>
            <Text style={styles.emptySubtitle}>Tap the + button to add one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => openEdit(item)}
            onDelete={() => handleDelete(item)}
          />
        )}
      />

      <Pressable style={styles.fab} onPress={openCreate} hitSlop={8}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <TransactionFormModal
        visible={formVisible}
        transaction={editingTransaction}
        onSubmit={handleSubmit}
        onClose={() => setFormVisible(false)}
      />

      <CategoriesModal visible={categoriesVisible} onClose={() => setCategoriesVisible(false)} />

      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setSortMenuVisible(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Sort by</Text>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <Pressable
                key={option}
                style={styles.menuOption}
                onPress={() => {
                  setSortBy(option);
                  setSortMenuVisible(false);
                }}
              >
                <Text style={[styles.menuOptionText, sortBy === option && styles.menuOptionTextActive]}>
                  {SORT_LABELS[option]}
                </Text>
                {sortBy === option && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
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
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
  },
  chipActive: {
    backgroundColor: "#4f46e5",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  chipTextActive: {
    color: "#fff",
  },
  toolbarRight: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    padding: 6,
  },
  listContent: {
    paddingBottom: 100,
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
  fab: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 32,
  },
  menu: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9ca3af",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
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
