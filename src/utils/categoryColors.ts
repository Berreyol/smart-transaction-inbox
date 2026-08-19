// Validated categorical palette (8 slots) — order is the CVD-safety mechanism,
// not cosmetic, so colors are assigned by each category's fixed position in an
// alphabetically-sorted list, never by chart rank/order, so a category keeps
// the same color across renders regardless of what's currently visible/sorted.
const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

// Categories past the 8th slot (rare — beyond the default category count)
// share this muted color instead of a cycled/reused hue.
const OVERFLOW_COLOR = "#9ca3af";

/**
 * Returns a stable color for `categoryName`, based on its position in
 * `orderedNames` (expected to be every category of that type, sorted the
 * same way every time — e.g. alphabetically, as categoriesStore already
 * returns them) rather than its position in whatever subset is on screen.
 */
export function colorForCategory(categoryName: string, orderedNames: string[]): string {
  const index = orderedNames.indexOf(categoryName);
  if (index === -1 || index >= CATEGORICAL_PALETTE.length) return OVERFLOW_COLOR;
  return CATEGORICAL_PALETTE[index];
}
