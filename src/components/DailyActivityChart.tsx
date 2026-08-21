import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BarChart } from "react-native-gifted-charts";
import type { Transaction } from "../types/database";

interface Props {
  /** Already filtered to the selected date range + account. */
  transactions: Transaction[];
  /** The resolved bounds of the active date filter; null means unbounded (falls back to today). */
  rangeStart: Date | null;
  rangeEnd: Date | null;
}

const BAR_COLOR = "#4f46e5";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOURS_PER_BLOCK = 4;
// Above this many bars, per-day weekday labels ("Mon") get replaced with a
// bare day-of-month number and bars narrow — otherwise a 30-day range would
// either overlap its labels or need a huge scroll area.
const WEEKDAY_LABEL_THRESHOLD = 7;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function hourBlockLabel(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${period}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatMonthDay(d: Date): string {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function DailyActivityChart({ transactions, rangeStart, rangeEnd }: Props) {
  const today = startOfDay(new Date());
  const end = rangeEnd ? (startOfDay(rangeEnd) > today ? today : startOfDay(rangeEnd)) : today;
  const start = rangeStart ? startOfDay(rangeStart) : end;
  const isSingleDay = start.getTime() === end.getTime();

  let data: { value: number; label: string; frontColor: string }[];
  let subtitle: string;

  if (isSingleDay) {
    // A single day has no day-to-day variation to show, so split it into
    // six 4-hour blocks instead — otherwise this would just be one bar.
    const countByBlock = new Array(24 / HOURS_PER_BLOCK).fill(0);
    for (const t of transactions) {
      countByBlock[Math.floor(new Date(t.date).getHours() / HOURS_PER_BLOCK)] += 1;
    }
    data = countByBlock.map((value, i) => ({
      value,
      label: hourBlockLabel(i * HOURS_PER_BLOCK),
      frontColor: BAR_COLOR,
    }));
    const count = transactions.length;
    const dayLabel = start.getTime() === today.getTime() ? "today" : `on ${formatISODate(start)}`;
    subtitle = `${count} transaction${count === 1 ? "" : "s"} ${dayLabel}`;
  } else {
    const countByDay = new Map<string, number>();
    for (const t of transactions) {
      const key = dayKey(new Date(t.date));
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }

    const days: Date[] = [];
    for (let d = start.getTime(); d <= end.getTime(); d += DAY_MS) {
      days.push(new Date(d));
    }

    const useWeekdayLabels = days.length <= WEEKDAY_LABEL_THRESHOLD;
    data = days.map((d) => ({
      value: countByDay.get(dayKey(d)) ?? 0,
      label: useWeekdayLabels
        ? d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)
        : String(d.getDate()),
      frontColor: BAR_COLOR,
    }));

    const count = transactions.length;
    subtitle = `${count} transaction${count === 1 ? "" : "s"} ${formatMonthDay(start)} to ${formatMonthDay(end)}`;
  }

  const maxCount = Math.max(...data.map((d) => d.value), 1);
  // Few enough bars (hourly blocks, or a short daily range) to afford wider
  // bars and spacing; longer daily ranges need to narrow up to fit.
  const useWideBars = data.length <= WEEKDAY_LABEL_THRESHOLD;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={data}
          height={110}
          barWidth={useWideBars ? 26 : 12}
          spacing={useWideBars ? 24 : 10}
          initialSpacing={14}
          barBorderRadius={4}
          maxValue={maxCount + 1}
          noOfSections={maxCount + 1}
          hideYAxisText
          yAxisThickness={0}
          xAxisThickness={1}
          xAxisColor="#e5e7eb"
          rulesColor="#f3f4f6"
          xAxisLabelTextStyle={styles.axisText}
          isAnimated
        />
      </ScrollView>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "600",
  },
  axisText: {
    color: "#9ca3af",
    fontSize: 11,
  },
});
