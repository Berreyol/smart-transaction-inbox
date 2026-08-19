import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { categoriesForType } from "../utils/categories";
import type { TransactionType } from "../types/database";

interface Props {
  visible: boolean;
  type: TransactionType | null;
  onSelect: (category: string) => void;
  onClose: () => void;
}

export function CategoryModal({ visible, type, onSelect, onClose }: Props) {
  const categories = categoriesForType(type);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Choose a category</Text>
          {categories.map((category) => (
            <Pressable
              key={category}
              style={styles.option}
              onPress={() => onSelect(category)}
            >
              <Text style={styles.optionText}>{category}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
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
