import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../store/authStore";
import { useCategoriesStore } from "../store/categoriesStore";
import type { Category, TransactionType } from "../types/database";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function CategorySection({
  title,
  type,
  categories,
}: {
  title: string;
  type: TransactionType;
  categories: Category[];
}) {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.session?.user.id);
  const addCategory = useCategoriesStore((state) => state.addCategory);
  const renameCategory = useCategoriesStore((state) => state.renameCategory);
  const deleteCategory = useCategoriesStore((state) => state.deleteCategory);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleAdd = async () => {
    if (!userId || !newName.trim()) return;
    const success = await addCategory(userId, newName.trim(), type);
    if (success) setNewName("");
    else Alert.alert(t("categories.addFailedTitle"), t("categories.addFailedMessage"));
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const id = editingId;
    setEditingId(null);
    if (!editingName.trim()) return;
    await renameCategory(id, editingName.trim());
  };

  const handleDelete = (category: Category) => {
    Alert.alert(t("categories.deleteTitle"), t("categories.deleteMessage", { name: category.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteCategory(category.id) },
    ]);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {categories.map((category) => (
        <View key={category.id} style={styles.row}>
          {editingId === category.id ? (
            <TextInput
              style={styles.editInput}
              value={editingName}
              onChangeText={setEditingName}
              onSubmitEditing={commitEdit}
              onBlur={commitEdit}
              autoFocus
            />
          ) : (
            <Pressable style={styles.rowLabel} onPress={() => startEdit(category)}>
              <Text style={styles.rowText}>{category.name}</Text>
            </Pressable>
          )}
          <Pressable hitSlop={10} onPress={() => handleDelete(category)}>
            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder={t("categories.newCategoryPlaceholder", {
            type: type === "expense" ? t("common.expense") : t("common.income"),
          })}
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={handleAdd}
        />
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export function CategoriesModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const categories = useCategoriesStore((state) => state.items);
  const expenseCategories = categories.filter((c) => c.type === "expense");
  const incomeCategories = categories.filter((c) => c.type === "income");

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("categories.title")}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.done}>{t("common.done")}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <CategorySection title={t("common.expense")} type="expense" categories={expenseCategories} />
          <CategorySection title={t("common.income")} type="income" categories={incomeCategories} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  done: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4f46e5",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowLabel: {
    flex: 1,
  },
  rowText: {
    fontSize: 15,
    color: "#111827",
  },
  editInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    borderBottomWidth: 1,
    borderBottomColor: "#4f46e5",
    paddingVertical: 2,
    marginRight: 12,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginRight: 8,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
  },
});
