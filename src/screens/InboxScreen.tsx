import { useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { BankAccountPickerModal } from "../components/BankAccountPickerModal";
import { CategoryModal } from "../components/CategoryModal";
import { PendingTransactionCard } from "../components/PendingTransactionCard";
import { useAuthStore } from "../store/authStore";
import { useBankAccountsStore } from "../store/bankAccountsStore";
import { useCategoriesStore } from "../store/categoriesStore";
import { useInboxStore } from "../store/inboxStore";
import type { PendingTransaction } from "../types/database";

export function InboxScreen() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const { items, isLoading, fetchPending, approve, reject, subscribe } = useInboxStore();
  const categories = useCategoriesStore((state) => state.items);
  const fetchCategories = useCategoriesStore((state) => state.fetchCategories);
  const subscribeCategories = useCategoriesStore((state) => state.subscribe);
  const bankAccounts = useBankAccountsStore((state) => state.items);
  const fetchBankAccounts = useBankAccountsStore((state) => state.fetchBankAccounts);
  const subscribeBankAccounts = useBankAccountsStore((state) => state.subscribe);
  const [approvingItem, setApprovingItem] = useState<PendingTransaction | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchPending(userId);
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
    subscribe,
    fetchCategories,
    subscribeCategories,
    fetchBankAccounts,
    subscribeBankAccounts,
  ]);

  const handleReject = (item: PendingTransaction) => {
    Alert.alert("Reject transaction?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => reject(item.id) },
    ]);
  };

  // Category first, then (if the user has any saved accounts) which one to
  // assign — skippable, since account_id is nullable and not every user
  // bothers tracking accounts individually.
  const handleCategorySelected = async (category: string) => {
    if (!approvingItem) return;
    if (bankAccounts.length === 0) {
      await finishApproval(category, null);
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
      Alert.alert("Couldn't approve", "Something went wrong — please try again.");
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
            <Text style={styles.emptyTitle}>Inbox zero 🎉</Text>
            <Text style={styles.emptySubtitle}>
              Forward a bank email to your inbox address and it'll show up here for review.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PendingTransactionCard
            item={item}
            onApprove={() => setApprovingItem(item)}
            onReject={() => handleReject(item)}
          />
        )}
      />

      <CategoryModal
        visible={approvingItem !== null && pendingCategory === null}
        type={approvingItem?.type ?? null}
        categories={categories}
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
