import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { CategoriesModal } from "../components/CategoriesModal";
import { TransactionFormModal } from "../components/TransactionFormModal";
import { TransactionListItem } from "../components/TransactionListItem";
import type { RootTabParamList } from "../navigation/types";
import { useAuthStore } from "../store/authStore";
import { useBankAccountsStore } from "../store/bankAccountsStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useDateFilterStore } from "../store/dateFilterStore";
import { useTransactionsStore, type TransactionInput } from "../store/transactionsStore";
import type { Transaction, TransactionType } from "../types/database";
import { DATE_PRESET_ORDER, DEFAULT_DATE_PRESET, resolveDateRange, type DatePreset } from "../utils/dateFilter";

type TypeFilter = "all" | TransactionType;
type CategoryFilter = "all" | string;
type SortOption = "recent" | "amount_desc" | "amount_asc";

export function TransactionsScreen() {
  const { t } = useTranslation();
  const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
    all: t("transactions.filterAll"),
    expense: t("common.expense"),
    income: t("common.income"),
  };
  const SORT_LABELS: Record<SortOption, string> = {
    recent: t("transactions.sortRecent"),
    amount_desc: t("transactions.sortAmountDesc"),
    amount_asc: t("transactions.sortAmountAsc"),
  };
  const DATE_PRESET_LABELS: Record<DatePreset, string> = {
    all: t("dateFilter.all"),
    today: t("dateFilter.today"),
    "7d": t("dateFilter.7d"),
    "30d": t("dateFilter.30d"),
    month: t("dateFilter.month"),
    custom: t("dateFilter.custom"),
  };
  const route = useRoute<RouteProp<RootTabParamList, "Transactions">>();
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
  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);
  const fetchBankAccounts = useBankAccountsStore((state) => state.fetchBankAccounts);
  const subscribeBankAccounts = useBankAccountsStore((state) => state.subscribe);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const datePreset = useDateFilterStore((state) => state.datePreset);
  const setDatePreset = useDateFilterStore((state) => state.setDatePreset);
  const customStart = useDateFilterStore((state) => state.customStart);
  const setCustomStart = useDateFilterStore((state) => state.setCustomStart);
  const customEnd = useDateFilterStore((state) => state.customEnd);
  const setCustomEnd = useDateFilterStore((state) => state.setCustomEnd);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [categoryMenuVisible, setCategoryMenuVisible] = useState(false);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [categoriesVisible, setCategoriesVisible] = useState(false);

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

  useEffect(() => {
    if (!route.params) return;
    if (route.params.type) setTypeFilter(route.params.type);
    if (route.params.category) setCategoryFilter(route.params.category);
    if (route.params.date) {
      setDatePreset("custom");
      setCustomStart(route.params.date);
      setCustomEnd(route.params.date);
    }
  }, [route.params]);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd],
  );

  const visibleItems = useMemo(() => {
    const filtered = items.filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      const txnDate = new Date(t.date);
      if (dateRange.start && txnDate < dateRange.start) return false;
      if (dateRange.end && txnDate > dateRange.end) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sortBy === "amount_desc") sorted.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "amount_asc") sorted.sort((a, b) => a.amount - b.amount);
    else sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted;
  }, [items, typeFilter, categoryFilter, dateRange, sortBy]);

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.type === "income"), [categories]);

  const openCreate = () => {
    setEditingTransaction(null);
    setFormVisible(true);
  };

  const openEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormVisible(true);
  };

  const handleDelete = (transaction: Transaction) => {
    Alert.alert(t("transactions.deleteTitle"), t("common.cantBeUndone"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteTransaction(transaction.id) },
    ]);
  };

  const handleSubmit = async (input: TransactionInput) => {
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
          <Pressable style={styles.iconButton} onPress={() => setDateMenuVisible(true)}>
            <Ionicons name="calendar-outline" size={20} color="#4f46e5" />
            {datePreset !== DEFAULT_DATE_PRESET && <View style={styles.iconBadge} />}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setCategoryMenuVisible(true)}>
            <Ionicons name="funnel-outline" size={20} color="#4f46e5" />
            {categoryFilter !== "all" && <View style={styles.iconBadge} />}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setSortMenuVisible(true)}>
            <Ionicons name="swap-vertical-outline" size={20} color="#4f46e5" />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={() => setCategoriesVisible(true)}>
            <Ionicons name="pricetags-outline" size={20} color="#4f46e5" />
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
        {categoryFilter !== "all" && (
          <View style={styles.activeFilterChip}>
            <Text style={styles.activeFilterText}>{categoryFilter}</Text>
            <Pressable hitSlop={8} onPress={() => setCategoryFilter("all")}>
              <Ionicons name="close" size={14} color="#4f46e5" />
            </Pressable>
          </View>
        )}
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
            <Text style={styles.emptyTitle}>{t("transactions.emptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>{t("transactions.emptySubtitle")}</Text>
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
        visible={dateMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setDateMenuVisible(false)}>
          <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{t("transactions.dateTitle")}</Text>
            {DATE_PRESET_ORDER.filter((option) => option !== "custom")
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
                {t("transactions.customRange")}
              </Text>
              {datePreset === "custom" && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
            </Pressable>

            {datePreset === "custom" && (
              <View style={styles.customDateRow}>
                <TextInput
                  style={styles.customDateInput}
                  placeholder={t("transactions.datePlaceholder")}
                  value={customStart}
                  onChangeText={setCustomStart}
                  autoCapitalize="none"
                />
                <Text style={styles.customDateSeparator}>{t("common.to")}</Text>
                <TextInput
                  style={styles.customDateInput}
                  placeholder={t("transactions.datePlaceholder")}
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  autoCapitalize="none"
                />
                <Pressable style={styles.customDateApply} onPress={() => setDateMenuVisible(false)}>
                  <Text style={styles.customDateApplyText}>{t("common.apply")}</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={categoryMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setCategoryMenuVisible(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{t("transactions.categoryTitle")}</Text>
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setCategoryFilter("all");
                setCategoryMenuVisible(false);
              }}
            >
              <Text style={[styles.menuOptionText, categoryFilter === "all" && styles.menuOptionTextActive]}>
                {t("common.allCategories")}
              </Text>
              {categoryFilter === "all" && <Ionicons name="checkmark" size={16} color="#4f46e5" />}
            </Pressable>

            {typeFilter !== "income" && expenseCategories.length > 0 && (
              <>
                <Text style={styles.menuTitle}>{t("common.expense")}</Text>
                {expenseCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={styles.menuOption}
                    onPress={() => {
                      setCategoryFilter(category.name);
                      setCategoryMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuOptionText,
                        categoryFilter === category.name && styles.menuOptionTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                    {categoryFilter === category.name && (
                      <Ionicons name="checkmark" size={16} color="#4f46e5" />
                    )}
                  </Pressable>
                ))}
              </>
            )}

            {typeFilter !== "expense" && incomeCategories.length > 0 && (
              <>
                <Text style={styles.menuTitle}>{t("common.income")}</Text>
                {incomeCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    style={styles.menuOption}
                    onPress={() => {
                      setCategoryFilter(category.name);
                      setCategoryMenuVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.menuOptionText,
                        categoryFilter === category.name && styles.menuOptionTextActive,
                      ]}
                    >
                      {category.name}
                    </Text>
                    {categoryFilter === category.name && (
                      <Ionicons name="checkmark" size={16} color="#4f46e5" />
                    )}
                  </Pressable>
                ))}
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setSortMenuVisible(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>{t("transactions.sortTitle")}</Text>
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
    backgroundColor: "#fff",
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
