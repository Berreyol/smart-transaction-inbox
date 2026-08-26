/**
 * Normalizes a merchant string into the same key used for
 * merchant_category_map.merchant_key (see 0010_merchant_category_map.sql,
 * `lower(trim(merchant))`) so client-side lookups match the server-side
 * upsert.
 */
export function normalizeMerchantKey(merchant: string | null | undefined): string | null {
  const trimmed = merchant?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}
