// Shared date-range filter logic for TransactionsScreen and DashboardScreen.
export type DatePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

/** Screens open scoped to the current month rather than "All time". */
export const DEFAULT_DATE_PRESET: DatePreset = "month";

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  custom: "Custom range",
};

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(startOfDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Inclusive day count between two resolved bounds — an unbounded/future end
 * clamps to today, and an unbounded start clamps to that end (so a fully
 * unbounded range reads as a 1-day span, "today").
 */
export function daySpan(start: Date | null, end: Date | null): number {
  const today = startOfDay(new Date());
  const resolvedEnd = end ? (startOfDay(end) > today ? today : startOfDay(end)) : today;
  const resolvedStart = start ? startOfDay(start) : resolvedEnd;
  return Math.round((resolvedEnd.getTime() - resolvedStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/** Resolves a preset (or validated custom YYYY-MM-DD bounds) to a concrete [start, end] range; null bound = unbounded. */
export function resolveDateRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string,
): { start: Date | null; end: Date | null } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "7d":
      return { start: startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)), end: endOfDay(now) };
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case "custom": {
      const start = ISO_DATE_RE.test(customStart) ? startOfDay(new Date(`${customStart}T00:00:00`)) : null;
      const end = ISO_DATE_RE.test(customEnd) ? endOfDay(new Date(`${customEnd}T00:00:00`)) : null;
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
}
