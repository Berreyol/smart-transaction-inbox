import type { Category, TransactionType } from "../types/database";

export function categoriesForType(
  categories: Category[],
  type: TransactionType | null,
): Category[] {
  if (!type) return [];
  return categories.filter((c) => c.type === type);
}
