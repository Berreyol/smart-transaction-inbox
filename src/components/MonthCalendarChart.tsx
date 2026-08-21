import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Transaction } from "../types/database";

interface Props {
  /** Already filtered to the selected account (and implicitly to this month, but we re-check below). */
  transactions: Transaction[];
  /** Any date within the month to render. */
  monthDate: Date;
  onSelectDate?: (date: Date) => void;
}

const LEVEL_COLORS = ["#f3f4f6", "#e0e7ff", "#a5b4fc", "#6366f1", "#4338ca"];
const LEVEL_TEXT_COLORS = ["#9ca3af", "#4338ca", "#3730a3", "#fff", "#fff"];
const WEEKDAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABEL_FORMAT: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" };

function levelForCount(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export function MonthCalendarChart({ transactions, monthDate, onSelectDate }: Props) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const countByDate = new Map<number, number>();
  for (const t of transactions) {
    const d = new Date(t.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      countByDate.set(d.getDate(), (countByDate.get(d.getDate()) ?? 0) + 1);
    }
  }

  const cells: (number | null)[] = [
    ...(Array(firstWeekday).fill(null) as null[]),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const totalTransactions = [...countByDate.values()].reduce((sum, count) => sum + count, 0);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{monthDate.toLocaleDateString(undefined, MONTH_LABEL_FORMAT)}</Text>
        <Text style={styles.subtitle}>
          {totalTransactions} transaction{totalTransactions === 1 ? "" : "s"}
        </Text>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_HEADERS.map((label, i) => (
          <View key={i} style={styles.cell}>
            <Text style={styles.weekHeaderLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={styles.cell} />;
            const level = levelForCount(countByDate.get(day) ?? 0);
            const isToday = isCurrentMonth && today.getDate() === day;
            return (
              <Pressable
                key={di}
                style={styles.cell}
                onPress={() => onSelectDate?.(new Date(year, month, day))}
              >
                <View
                  style={[
                    styles.dayCell,
                    { backgroundColor: LEVEL_COLORS[level] },
                    isToday && styles.todayCell,
                  ]}
                >
                  <Text style={[styles.dayNumber, { color: LEVEL_TEXT_COLORS[level] }]}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

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
  weekRow: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  weekHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
  },
  dayCell: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: "#4f46e5",
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: "600",
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
