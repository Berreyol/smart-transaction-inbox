import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { categoriesForType } from "../utils/categories";
import type { Category, TransactionType } from "../types/database";

interface Props {
  visible: boolean;
  type: TransactionType | null;
  categories: Category[];
  /** Previously-chosen category for this merchant (see merchant_category_map), if any. */
  suggestedCategory?: string | null;
  onSelect: (category: string) => void;
  onClose: () => void;
}

export function CategoryModal({
  visible,
  type,
  categories,
  suggestedCategory,
  onSelect,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const allOptions = categoriesForType(categories, type);
  const hasSuggestion = !!suggestedCategory && allOptions.some((c) => c.name === suggestedCategory);
  const options = hasSuggestion
    ? allOptions.filter((c) => c.name !== suggestedCategory)
    : allOptions;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{t("common.chooseCategory")}</Text>
          {hasSuggestion && (
            <>
              <Text style={styles.suggestedLabel}>{t("categoryPicker.suggestedLabel")}</Text>
              <Pressable
                style={[styles.option, styles.suggestedOption]}
                onPress={() => onSelect(suggestedCategory as string)}
              >
                <Text style={[styles.optionText, styles.suggestedOptionText]}>
                  {suggestedCategory}
                </Text>
              </Pressable>
            </>
          )}
          {options.length === 0 && !hasSuggestion && (
            <Text style={styles.optionText}>{t("categoryPicker.empty")}</Text>
          )}
          {options.map((category) => (
            <Pressable
              key={category.id}
              style={styles.option}
              onPress={() => onSelect(category.name)}
            >
              <Text style={styles.optionText}>{category.name}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t("common.cancel")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  option: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  optionText: {
    fontSize: 16,
    color: "#111827",
  },
  suggestedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4f46e5",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  suggestedOption: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  suggestedOptionText: {
    fontWeight: "700",
    color: "#4338ca",
  },
  cancel: {
    paddingVertical: 14,
    marginTop: 4,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#dc2626",
    fontWeight: "600",
  },
});
