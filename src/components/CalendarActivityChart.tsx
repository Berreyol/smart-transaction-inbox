import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Transaction } from "../types/database";

interface Props {
  /** Already filtered to the selected date range + account. */
  transactions: Transaction[];
  /** The resolved bounds of the active date filter; null means unbounded. */
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelectDate?: (date: Date) => void;
}

const CELL_SIZE = 12;
const CELL_GAP = 3;
// Caps the grid at ~53 weeks (GitHub's contribution graph does the same)
// so an unbounded "All time" filter with old transactions doesn't render
// years of near-empty weeks.
const MAX_DAYS = 371;
const LEVEL_COLORS = ["#f3f4f6", "#e0e7ff", "#a5b4fc", "#6366f1", "#4338ca"];
const WEEKDAY_LABELS = ["", "M", "", "W", "", "F", ""];
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function levelForCount(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function CalendarActivityChart({ transactions, rangeStart, rangeEnd, onSelectDate }: Props) {
  const today = startOfDay(new Date());
  const end = rangeEnd ? (startOfDay(rangeEnd) > today ? today : startOfDay(rangeEnd)) : today;

  let start: Date;
  if (rangeStart) {
    start = startOfDay(rangeStart);
  } else if (transactions.length > 0) {
    start = transactions.reduce(
      (min, t) => (startOfDay(new Date(t.date)) < min ? startOfDay(new Date(t.date)) : min),
      end,
    );
  } else {
    start = end;
  }
  if (Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1 > MAX_DAYS) {
    start = new Date(end.getTime() - (MAX_DAYS - 1) * DAY_MS);
  }

  const countByDay = new Map<string, number>();
  for (const t of transactions) {
    const key = dayKey(new Date(t.date));
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  // Pad to the preceding Sunday and following Saturday so full weeks line up.
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const weeks: { date: Date; inRange: boolean }[][] = [];
  for (let weekStart = new Date(gridStart); weekStart <= gridEnd; weekStart.setDate(weekStart.getDate() + 7)) {
    const week: { date: Date; inRange: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * DAY_MS);
      week.push({ date, inRange: date >= start && date <= end });
    }
    weeks.push(week);
  }

  const totalTransactions = transactions.length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Activity</Text>
        <Text style={styles.subtitle}>
          {totalTransactions} transaction{totalTransactions === 1 ? "" : "s"}
        </Text>
      </View>
      <View style={styles.gridRow}>
        <View style={styles.weekdayColumn}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weeksRow}>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekColumn}>
                {week.map(({ date, inRange }, di) => {
                  const count = countByDay.get(dayKey(date)) ?? 0;
                  const color = inRange ? LEVEL_COLORS[levelForCount(count)] : "transparent";
                  if (!inRange) return <View key={di} style={[styles.cell, { backgroundColor: color }]} />;
                  return (
                    <Pressable
                      key={di}
                      hitSlop={2}
                      style={[styles.cell, { backgroundColor: color }]}
                      onPress={() => onSelectDate?.(date)}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>Less</Text>
        {LEVEL_COLORS.map((color, i) => (
          <View key={i} style={[styles.legendSwatch, { backgroundColor: color }]} />
        ))}
        <Text style={styles.legendLabel}>More</Text>
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
  gridRow: {
    flexDirection: "row",
  },
  weekdayColumn: {
    justifyContent: "space-between",
    marginRight: 6,
  },
  weekdayLabel: {
    fontSize: 9,
    color: "#9ca3af",
    height: CELL_SIZE,
    lineHeight: CELL_SIZE,
    marginBottom: CELL_GAP,
  },
  weeksRow: {
    flexDirection: "row",
  },
  weekColumn: {
    marginRight: CELL_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 3,
    marginBottom: CELL_GAP,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: "#9ca3af",
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
