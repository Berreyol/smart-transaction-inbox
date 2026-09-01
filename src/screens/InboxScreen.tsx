import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { BankAccountPickerModal } from "../components/BankAccountPickerModal";
import { CategoryModal } from "../components/CategoryModal";
import { EditPendingTransactionModal } from "../components/EditPendingTransactionModal";
import { PendingTransactionCard } from "../components/PendingTransactionCard";
import { useAuthStore } from "../store/authStore";
import { useBankAccountsStore } from "../store/bankAccountsStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useInboxStore } from "../store/inboxStore";
import type { PendingTransaction, PendingTransactionEdits } from "../types/database";
import { normalizeMerchantKey } from "../utils/merchant";

export function InboxScreen() {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.session?.user.id);
  const { items, suggestions, isLoading, fetchPending, fetchSuggestions, approve, reject, update, subscribe } =
    useInboxStore();
  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);
  const bankAccounts = useBankAccountsStore((state) => state.items);
  const fetchBankAccounts = useBankAccountsStore((state) => state.fetchBankAccounts);
  const subscribeBankAccounts = useBankAccountsStore((state) => state.subscribe);
  const [approvingItem, setApprovingItem] = useState<PendingTransaction | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<PendingTransaction | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchPending(userId);
    fetchSuggestions(userId);
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
    fetchPending,
    fetchSuggestions,
    subscribe,
    fetchCategories,
    subscribeCategories,
    fetchBankAccounts,
    subscribeBankAccounts,
  ]);

  const suggestedCategory = approvingItem
    ? suggestions[normalizeMerchantKey(approvingItem.merchant) ?? ""] ?? null
    : null;

  const handleReject = (item: PendingTransaction) => {
    Alert.alert(t("inbox.rejectTitle"), t("common.cantBeUndone"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.reject"), style: "destructive", onPress: () => reject(item.id) },
    ]);
  };

  // Category first, then (if the user has any saved accounts) which one to
  // assign — skippable, since account_id is nullable and not every user
  // bothers tracking accounts individually. Also skipped when parse-email
  // already matched the account by alias (see matchBankAccount() in
  // parser.ts) — no need to make the user re-confirm what was already found
  // in the email.
  const handleCategorySelected = async (category: string) => {
    if (!approvingItem) return;
    if (bankAccounts.length === 0 || approvingItem.account_id) {
      await finishApproval(category, approvingItem.account_id);
      return;
    }
    setPendingCategory(category);
  };

  const handleAccountSelected = async (accountId: string | null) => {
    if (!pendingCategory) return;
    await finishApproval(pendingCategory, accountId);
  };

  const finishApproval = async (category: string, accountId: string | null) => {
    if (!approvingItem) return;
    const pendingId = approvingItem.id;
    setApprovingItem(null);
    setPendingCategory(null);
    const success = await approve(pendingId, category, accountId);
    if (!success) {
      Alert.alert(t("inbox.approveFailedTitle"), t("common.genericErrorMessage"));
    }
  };

  const handleEditSave = async (edits: PendingTransactionEdits) => {
    if (!editingItem) return;
    const pendingId = editingItem.id;
    setEditingItem(null);
    const success = await update(pendingId, edits);
    if (!success) {
      Alert.alert(t("inbox.editFailedTitle"), t("common.genericErrorMessage"));
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 && styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={() => userId && fetchPending(userId)} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("inbox.emptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>{t("inbox.emptySubtitle")}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PendingTransactionCard
            item={item}
            matchedAccount={bankAccounts.find((account) => account.id === item.account_id) ?? null}
            onApprove={() => setApprovingItem(item)}
            onReject={() => handleReject(item)}
            onEdit={() => setEditingItem(item)}
          />
        )}
      />

      <EditPendingTransactionModal
        item={editingItem}
        onSave={handleEditSave}
        onClose={() => setEditingItem(null)}
      />

      <CategoryModal
        visible={approvingItem !== null && pendingCategory === null}
        type={approvingItem?.type ?? null}
        categories={categories}
        suggestedCategory={suggestedCategory}
        onSelect={handleCategorySelected}
        onClose={() => setApprovingItem(null)}
      />

      <BankAccountPickerModal
        visible={pendingCategory !== null}
        accounts={bankAccounts}
        onSelect={handleAccountSelected}
        onClose={() => {
          setApprovingItem(null);
          setPendingCategory(null);
        }}
      />
    </View>
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
