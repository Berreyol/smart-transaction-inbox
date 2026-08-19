import { StyleSheet, Text, View } from "react-native";
import { PieChart } from "react-native-gifted-charts";
import { colorForCategory } from "../utils/categoryColors";

interface CategoryAmount {
  category: string;
  total: number;
}

interface Props {
  title: string;
  /** Sorted descending by total; every entry must have total > 0. */
  amounts: CategoryAmount[];
  /** Every category of this type, in a fixed order — see colorForCategory. */
  orderedCategoryNames: string[];
}

export function CategoryPieChart({ title, amounts, orderedCategoryNames }: Props) {
  if (amounts.length === 0) return null;

  const grandTotal = amounts.reduce((sum, a) => sum + a.total, 0);
  const data = amounts.map((a) => ({
    value: a.total,
    color: colorForCategory(a.category, orderedCategoryNames),
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <PieChart data={data} radius={72} isAnimated />
        <View style={styles.legend}>
          {amounts.map((a) => (
            <View key={a.category} style={styles.legendRow}>
              <View
                style={[styles.dot, { backgroundColor: colorForCategory(a.category, orderedCategoryNames) }]}
              />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {a.category}
              </Text>
              <Text style={styles.legendPct}>
                {grandTotal > 0 ? Math.round((a.total / grandTotal) * 100) : 0}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  legend: {
    flex: 1,
    marginLeft: 16,
    gap: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
  },
  legendPct: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "600",
    marginLeft: 8,
  },
});
