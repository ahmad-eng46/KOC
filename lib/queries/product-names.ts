'use client';

import type { createClient } from '@/lib/supabase/client';

/**
 * What a product is called, for a set of ids, whatever the database has.
 *
 * Three sources, best first, because the app deploys ahead of its migrations
 * and a caption must never be the reason a screen fails:
 *
 *   1. product_identity (0065) — every product in the business including
 *      deleted ones, no money columns, readable at any role. The right answer.
 *   2. products_for_role — present since 0018 and granted to authenticated,
 *      so it works on a database with none of the recent migrations applied.
 *      It hides deleted products, so a line naming one falls through.
 *   3. nothing — the caller shows its own placeholder.
 *
 * The base products table is deliberately not in this list: its SELECT policy
 * is admin/accountant only because the cost price lives there, which is the
 * whole reason the names were missing for staff to begin with.
 */
export type ProductName = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  pack_size?: number;
  pack_name?: string | null;
};

const COLUMNS = 'id, name, sku, unit, pack_size, pack_name';

export async function fetchProductNames(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  productIds: string[],
): Promise<Map<string, ProductName>> {
  const out = new Map<string, ProductName>();
  if (productIds.length === 0) return out;

  const preferred = await supabase
    .from('product_identity')
    .select(COLUMNS)
    .eq('business_id', businessId)
    .in('id', productIds);

  if (!preferred.error) {
    for (const row of (preferred.data ?? []) as ProductName[]) out.set(row.id, row);
    return out;
  }

  // 0065 not applied on this database. products_for_role has always been here.
  const fallback = await supabase
    .from('products_for_role')
    .select(COLUMNS)
    .eq('business_id', businessId)
    .in('id', productIds);

  if (!fallback.error) {
    for (const row of (fallback.data ?? []) as ProductName[]) out.set(row.id, row);
  }

  // Both failing is not an error worth raising: the caller renders a
  // placeholder and every figure on the screen is still correct.
  return out;
}
