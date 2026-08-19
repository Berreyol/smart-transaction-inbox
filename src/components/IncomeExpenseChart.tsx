import { StyleSheet, Text, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";

const INCOME_COLOR = "#16a34a";
const EXPENSE_COLOR = "#dc2626";

interface Props {
  totalIncome: number;
  totalExpenses: number;
}

export function IncomeExpenseChart({ totalIncome, totalExpenses }: Props) {
  const maxValue = Math.max(totalIncome, totalExpenses, 1);

  const data = [
    { value: totalIncome, label: "Income", frontColor: INCOME_COLOR },
    { value: totalExpenses, label: "Expenses", frontColor: EXPENSE_COLOR },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: INCOME_COLOR }]}>
            ${totalIncome.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Income</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: EXPENSE_COLOR }]}>
            ${totalExpenses.toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Expenses</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>${(totalIncome - totalExpenses).toFixed(2)}</Text>
          <Text style={styles.statLabel}>Net</Text>
        </View>
      </View>

      <View style={styles.chartWrapper}>
        <BarChart
          data={data}
          height={140}
          barWidth={56}
          spacing={40}
          initialSpacing={20}
          barBorderRadius={6}
          maxValue={maxValue * 1.2}
          noOfSections={4}
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor="#e5e7eb"
          rulesColor="#f3f4f6"
          yAxisTextStyle={styles.axisText}
          xAxisLabelTextStyle={styles.axisText}
          isAnimated
        />
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
    marginBottom: 8,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  chartWrapper: {
    alignItems: "center",
    paddingRight: 16,
  },
  axisText: {
    color: "#9ca3af",
    fontSize: 11,
  },
});
