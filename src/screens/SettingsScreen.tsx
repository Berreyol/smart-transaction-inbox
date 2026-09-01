import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAuthStore } from "../store/authStore";
import { useProfileStore } from "../store/profileStore";

type LanguageOption = { value: string | null; labelKey: string };

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: null, labelKey: "settings.languageSystem" },
  { value: "en", labelKey: "settings.languageEnglish" },
  { value: "es", labelKey: "settings.languageSpanish" },
];

export function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const userId = useAuthStore((state) => state.session?.user.id);
  const profile = useProfileStore((state) => state.profile);
  const updateLanguage = useProfileStore((state) => state.updateLanguage);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t("settings.title") });
  }, [navigation, t]);

  const selected = profile?.language ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
      <Text style={styles.description}>{t("settings.languageDescription")}</Text>

      <View style={styles.optionList}>
        {LANGUAGE_OPTIONS.map((option) => {
          const isSelected = option.value === selected;
          return (
            <Pressable
              key={option.labelKey}
              style={styles.row}
              onPress={() => userId && updateLanguage(userId, option.value)}
            >
              <Text style={styles.rowText}>{t(option.labelKey)}</Text>
              {isSelected && <Ionicons name="checkmark" size={20} color="#4f46e5" />}
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    paddingHorizontal: 16,
  },
  description: {
    fontSize: 13,
    color: "#6b7280",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  optionList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#f3f4f6",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#f3f4f6",
  },
  rowText: {
    fontSize: 16,
    color: "#111827",
  },
});
