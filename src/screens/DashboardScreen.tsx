import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { CalendarActivityChart } from "../components/CalendarActivityChart";
import { CategoryPieChart } from "../components/CategoryPieChart";
import { DailyActivityChart } from "../components/DailyActivityChart";
import { IncomeExpenseChart } from "../components/IncomeExpenseChart";
import { MonthCalendarChart } from "../components/MonthCalendarChart";
import type { RootTabParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useBankAccountsStore } from "../store/bankAccountsStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useDateFilterStore } from "../store/dateFilterStore";
import { useTransactionsStore } from "../store/transactionsStore";
import type { TransactionType } from "../types/database";
import {
  DATE_PRESET_LABELS,
  daySpan,
  DEFAULT_DATE_PRESET,
  resolveDateRange,
  type DatePreset,
} from "../utils/dateFilter";

type AccountFilter = "all" | string;

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

export function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const userId = useAuthStore((state) => state.session?.user.id);
  const { items, isLoading, fetchTransactions, subscribe } = useTransactionsStore();
  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);
  const bankAccounts = useBankAccountsStore((state) => state.items);
  const fetchBankAccounts = useBankAccountsStore((state) => state.fetchBankAccounts);
  const subscribeBankAccounts = useBankAccountsStore((state) => state.subscribe);
  const [viewMode, setViewMode] = useState<ViewMode>("type");
  const [menuVisible, setMenuVisible] = useState(false);
  const datePreset = useDateFilterStore((state) => state.datePreset);
  const setDatePreset = useDateFilterStore((state) => state.setDatePreset);
  const customStart = useDateFilterStore((state) => state.customStart);
  const setCustomStart = useDateFilterStore((state) => state.setCustomStart);
  const customEnd = useDateFilterStore((state) => state.customEnd);
  const setCustomEnd = useDateFilterStore((state) => state.setCustomEnd);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchTransactions(userId);
    const unsubscribe = subscribe(userId);
    fetchCategories(userId);
    const unsubscribeCategories = subscribeCategories(userId);
    fetchBankAccounts(userId);
    const unsubscribeBankAccounts = subscribeBankAccounts(userId);
    return () => {
      unsubscribe();
      unsubscribeCategories();
      unsubscribeBankAccounts();
    };
  }, [
    userId,
    fetchTransactions,
    subscribe,
    fetchCategories,
    subscribeCategories,
    fetchBankAccounts,
    subscribeBankAccounts,
  ]);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  // The "month"/"all" presets always get their matching chart; for "custom"
  // (and the remaining "today"/"7d"/"30d" presets) the chart is picked from
  // the actual span, so a hand-picked range reads as well as a preset does.
  const activityChartKind = useMemo<"daily" | "month" | "heatmap">(() => {
    if (datePreset === "month") return "month";
    if (datePreset === "all") return "heatmap";
    if (datePreset !== "custom") return "daily";
    const span = daySpan(dateRange.start, dateRange.end);
    if (span <= 7) return "daily";
    if (span > 31) return "heatmap";
    // The month grid can only render one calendar month at a time, so a
    // range crossing a month boundary (e.g. Jan 25 – Feb 10) falls back to
    // the heatmap rather than silently dropping the days past the start's
    // month.
    const crossesMonthBoundary =
      dateRange.start &&
      dateRange.end &&
      (dateRange.start.getFullYear() !== dateRange.end.getFullYear() ||
        dateRange.start.getMonth() !== dateRange.end.getMonth());
    return crossesMonthBoundary ? "heatmap" : "month";
  }, [datePreset, dateRange]);

  const filteredItems = useMemo(() => {
    return items.filter((t) => {
      if (accountFilter !== "all" && t.account_id !== accountFilter) return false;
      if (dateRange.start || dateRange.end) {
        const txnDate = new Date(t.date);
        if (dateRange.start && txnDate < dateRange.start) return false;
        if (dateRange.end && txnDate > dateRange.end) return false;
      }
      return true;
    });
  }, [items, accountFilter, dateRange]);

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

  const selectedAccount = useMemo(
    () => bankAccounts.find((a) => a.id === accountFilter) ?? null,
    [bankAccounts, accountFilter],
  );

  const goToTransactions = (type?: TransactionType, category?: string) => {
    navigation.navigate("Transactions", { type, category });
  };

  const goToTransactionsDate = (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
    navigation.navigate("Transactions", { date: iso });
  };

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
        <View style={styles.toolbarRight}>
          <Pressable style={styles.iconButton} onPress={() => setDateMenuVisible(true)}>
            <Ionicons name="calendar-outline" size={20} color="#4f46e5" />
            {datePreset !== DEFAULT_DATE_PRESET && <View style={styles.iconBadge} />}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setAccountMenuVisible(true)}>
            <Ionicons name="card-outline" size={20} color="#4f46e5" />
            {accountFilter !== "all" && <View style={styles.iconBadge} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.activeFilterRow}>
        <View style={styles.activeFilterChip}>
          <Text style={styles.activeFilterText}>
            {datePreset === "custom" && customStart && customEnd
              ? `${customStart} – ${customEnd}`
              : DATE_PRESET_LABELS[datePreset]}
          </Text>
          {datePreset !== DEFAULT_DATE_PRESET && (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setDatePreset(DEFAULT_DATE_PRESET);
                setCustomStart("");
                setCustomEnd("");
              }}
            >
              <Ionicons name="close" size={14} color="#4f46e5" />
            </Pressable>
          )}
        </View>
        {accountFilter !== "all" && (
          <View style={styles.activeFilterChip}>
            <Text style={styles.activeFilterText}>
              {selectedAccount ? `${selectedAccount.bank_name} — ${selectedAccount.account_alias}` : "Account"}
            </Text>
            <Pressable hitSlop={8} onPress={() => setAccountFilter("all")}>
              <Ionicons name="close" size={14} color="#4f46e5" />
            </Pressable>
          </View>
        )}
      </View>

      {viewMode === "type" ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={filteredItems.length === 0 && styles.emptyContainer}
          refreshControl={refreshControl}
        >
          {filteredItems.length > 0 ? (
            <>
              <IncomeExpenseChart
                totalIncome={totalIncome}
                totalExpenses={totalExpenses}
                onSelectType={(type) => goToTransactions(type)}
              />
              {activityChartKind === "month" ? (
                <MonthCalendarChart
                  transactions={filteredItems}
                  monthDate={dateRange.start ?? new Date()}
                  onSelectDate={goToTransactionsDate}
                />
              ) : activityChartKind === "heatmap" ? (
                <CalendarActivityChart
                  transactions={filteredItems}
                  rangeStart={dateRange.start}
                  rangeEnd={dateRange.end}
                  onSelectDate={goToTransactionsDate}
                />
              ) : (
                <DailyActivityChart
                  transactions={filteredItems}
                  rangeStart={dateRange.start}
                  rangeEnd={dateRange.end}
                />
              )}
            </>
          ) : (
            emptyComponent
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={categoryTotals.length === 0 && styles.emptyContainer}
          refreshControl={refreshControl}
        >
          {categoryTotals.length > 0 ? (
            <>
              <CategoryPieChart
                title="Expenses by category"
                amounts={expenseTotals}
                orderedCategoryNames={expenseCategoryNames}
                onSelectCategory={(category) => goToTransactions("expense", category)}
              />
              <CategoryPieChart
                title="Income by category"
                amounts={incomeTotals}
                orderedCategoryNames={incomeCategoryNames}
                onSelectCategory={(category) => goToTransactions("income", category)}
              />
            </>
          ) : (
            emptyComponent
          )}
        </ScrollView>
      )}

      <Modal
        visible={accountMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAccountMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setAccountMenuVisible(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Account</Text>
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setAccountFilter("all");
                setAccountMenuVisible(false);
              }}
            >
              <Text style={[styles.menuOptionText, accountFilter === "all" && styles.menuOptionTextActive]}>
                All accounts
              </Text>
              {accountFilter === "all" && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
            </Pressable>

            {bankAccounts.length === 0 && (
              <Text style={styles.emptyAccountsText}>No accounts yet — add one from the account menu.</Text>
            )}
            {bankAccounts.map((account) => (
              <Pressable
                key={account.id}
                style={styles.menuOption}
                onPress={() => {
                  setAccountFilter(account.id);
                  setAccountMenuVisible(false);
                }}
              >
                <View>
                  <Text
                    style={[styles.menuOptionText, accountFilter === account.id && styles.menuOptionTextActive]}
                  >
                    {account.bank_name}
                  </Text>
                  <Text style={styles.menuOptionSubtext}>{account.account_alias}</Text>
                </View>
                {accountFilter === account.id && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
  toolbarRight: {
    flexDirection: "row",
    gap: 4,
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
    gap: 8,
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
  menuOptionSubtext: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  emptyAccountsText: {
    fontSize: 13,
    color: "#9ca3af",
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxWidth: 220,
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
