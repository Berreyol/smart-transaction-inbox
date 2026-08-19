import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CategoryPieChart } from "../components/CategoryPieChart";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { TransactionListItem } from "../components/TransactionListItem";
import { useAuthStore } from "../store/authStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useTransactionsStore } from "../store/transactionsStore";
import type { Transaction, TransactionType } from "../types/database";
import { DATE_PRESET_LABELS, resolveDateRange, type DatePreset } from "../utils/dateFilter";

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
  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [menuVisible, setMenuVisible] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dateMenuVisible, setDateMenuVisible] = useState(false);

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

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  const filteredItems = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return items;
    return items.filter((t) => {
      const txnDate = new Date(t.date);
      if (dateRange.start && txnDate < dateRange.start) return false;
      if (dateRange.end && txnDate > dateRange.end) return false;
      return true;
    });
  }, [items, dateRange]);

  const { totalIncome, totalExpenses } = useMemo(() => {
    return filteredItems.reduce(
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
  }, [filteredItems]);

  const categoryTotals = useMemo<CategoryTotal[]>(() => {
    const map = new Map<string, CategoryTotal>();
    for (const tx of filteredItems) {
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
  }, [filteredItems]);

  const expenseTotals = useMemo(
    () => categoryTotals.filter((t) => t.type === "expense"),
    [categoryTotals],
  );
  const incomeTotals = useMemo(() => categoryTotals.filter((t) => t.type === "income"), [categoryTotals]);

  // Alphabetical and independent of which categories currently have
  // transactions, so a category's pie color stays the same across renders —
  // see colorForCategory.
  const expenseCategoryNames = useMemo(
    () => categories.filter((c) => c.type === "expense").map((c) => c.name),
    [categories],
  );
  const incomeCategoryNames = useMemo(
    () => categories.filter((c) => c.type === "income").map((c) => c.name),
    [categories],
  );

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
      <View style={styles.toolbar}>
        <Pressable style={styles.viewSwitcher} onPress={() => setMenuVisible(true)}>
          <Text style={styles.viewSwitcherText}>{VIEW_LABELS[viewMode]}</Text>
          <Ionicons name="chevron-down" size={16} color="#4f46e5" />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => setDateMenuVisible(true)}>
          <Ionicons name="calendar-outline" size={20} color="#4f46e5" />
          {datePreset !== "all" && <View style={styles.iconBadge} />}
        </Pressable>
      </View>

      {datePreset !== "all" && (
        <View style={styles.activeFilterRow}>
          <View style={styles.activeFilterChip}>
            <Text style={styles.activeFilterText}>
              {datePreset === "custom" && customStart && customEnd
                ? `${customStart} – ${customEnd}`
                : DATE_PRESET_LABELS[datePreset]}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setDatePreset("all");
                setCustomStart("");
                setCustomEnd("");
              }}
            >
              <Ionicons name="close" size={14} color="#4f46e5" />
            </Pressable>
          </View>
        </View>
      )}

      {viewMode === "type" ? (
        <FlatList
          style={styles.list}
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={filteredItems.length === 0 && styles.emptyContainer}
          refreshControl={refreshControl}
          ListHeaderComponent={
            filteredItems.length > 0 ? (
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
              <>
                <CategoryPieChart
                  title="Expenses by category"
                  amounts={expenseTotals}
                  orderedCategoryNames={expenseCategoryNames}
                />
                <CategoryPieChart
                  title="Income by category"
                  amounts={incomeTotals}
                  orderedCategoryNames={incomeCategoryNames}
                />
                <Text style={styles.categoryHeader}>Totals by category</Text>
              </>
            ) : null
          }
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }) => <CategoryTotalRow total={item} />}
        />
      )}

      <Modal
        visible={dateMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setDateMenuVisible(false)}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>Date</Text>
            {(Object.keys(DATE_PRESET_LABELS) as DatePreset[])
              .filter((option) => option !== "custom")
              .map((option) => (
                <Pressable
                  key={option}
                  style={styles.menuOption}
                  onPress={() => {
                    setDatePreset(option);
                    setDateMenuVisible(false);
                  }}
                >
                  <Text style={[styles.menuOptionText, datePreset === option && styles.menuOptionTextActive]}>
                    {DATE_PRESET_LABELS[option]}
                  </Text>
                  {datePreset === option && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
                </Pressable>
              ))}

            <Pressable style={styles.menuOption} onPress={() => setDatePreset("custom")}>
              <Text style={[styles.menuOptionText, datePreset === "custom" && styles.menuOptionTextActive]}>
                Custom range
              </Text>
              {datePreset === "custom" && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
            </Pressable>

            {datePreset === "custom" && (
              <View style={styles.customDateRow}>
                <TextInput
                  style={styles.customDateInput}
                  placeholder="YYYY-MM-DD"
                  value={customStart}
                  onChangeText={setCustomStart}
                  autoCapitalize="none"
                />
                <Text style={styles.customDateSeparator}>to</Text>
                <TextInput
                  style={styles.customDateInput}
                  placeholder="YYYY-MM-DD"
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  autoCapitalize="none"
                />
                <Pressable style={styles.customDateApply} onPress={() => setDateMenuVisible(false)}>
                  <Text style={styles.customDateApplyText}>Apply</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 12,
  },
  viewSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
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
  iconButton: {
    padding: 6,
  },
  iconBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#4f46e5",
  },
  activeFilterRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#eef2ff",
  },
  activeFilterText: {
    fontSize: 13,
    fontWeight: "600",
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
  customDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  customDateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
  },
  customDateSeparator: {
    fontSize: 12,
    color: "#9ca3af",
  },
  customDateApply: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#4f46e5",
  },
  customDateApplyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
});
