import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What a customer or product is CALLED, for any role, including rows that have
 * been soft-deleted.
 *
 * Plain module, no 'use client': the same question is asked by report screens
 * and by the server actions that render PDFs, and both must answer it the same
 * way or an export disagrees with the page it was printed from.
 *
 * WHY THIS EXISTS
 *   Reading a name through a PostgREST embed — invoices ... customers(name) —
 *   is subject to that table's SELECT policy. customers_select and
 *   products_select both filter deleted_at IS NULL, so deleting a customer or
 *   a product stripped its name off every historical record that names it.
 *
 *   That is not only a blank. A report that GROUPS by the name collapses every
 *   unnamed row into one line — six customers became a single "—" worth
 *   Rs. 5,67,000 on the sales report — which reads as a plausible figure and
 *   is not one.
 *
 *   0065 (product_identity) and 0070 (customer_identity) are the answer: views
 *   carrying identity only, no money columns to gate, deliberately including
 *   deleted rows so history keeps its names.
 *
 * FALLBACK
 *   The app deploys ahead of its migrations, so each lookup degrades rather
 *   than throwing: identity view, then the table the caller could already
 *   read, then nothing and the caller shows its own placeholder. A caption is
 *   never a reason for a screen to fail.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type CustomerName = {
  id: string;
  name: string;
  phone: string | null;
  address?: string | null;
};

export type ProductName = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  pack_size?: number;
  pack_name?: string | null;
};

const CUSTOMER_COLUMNS = 'id, name, phone, address';
const PRODUCT_COLUMNS = 'id, name, sku, unit, pack_size, pack_name';

/** Distinct, non-empty ids. Saves a round trip when a page has none. */
function distinct(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((v): v is string => !!v)));
}

async function lookup<T extends { id: string }>(
  supabase: Db,
  sources: string[],
  columns: string,
  businessId: string | null,
  ids: string[],
): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (ids.length === 0) return out;

  for (const source of sources) {
    let query = supabase.from(source).select(columns).in('id', ids);
    if (businessId) query = query.eq('business_id', businessId);

    const { data, error } = await query;
    if (error) continue; // that view is not on this database yet — try the next

    for (const row of (data ?? []) as unknown as T[]) out.set(row.id, row);
    return out;
  }

  return out;
}

/**
 * Names for a set of customers. customer_identity first (0070), falling back
 * to the customers table, which hides soft-deleted rows but has always been
 * readable.
 */
export function fetchCustomerNames(
  supabase: Db,
  businessId: string | null,
  customerIds: Array<string | null | undefined>,
): Promise<Map<string, CustomerName>> {
  return lookup<CustomerName>(
    supabase,
    ['customer_identity', 'customers'],
    CUSTOMER_COLUMNS,
    businessId,
    distinct(customerIds),
  );
}

/**
 * Names for a set of products. product_identity first (0065), then
 * products_for_role — which hides soft-deleted rows, so a line naming one
 * falls through to the caller's placeholder.
 *
 * The base products table is deliberately absent: its SELECT policy is
 * admin/accountant only because the cost price lives there, which is the very
 * reason names were missing for staff to begin with.
 */
export function fetchProductNames(
  supabase: Db,
  businessId: string | null,
  productIds: Array<string | null | undefined>,
): Promise<Map<string, ProductName>> {
  return lookup<ProductName>(
    supabase,
    ['product_identity', 'products_for_role'],
    PRODUCT_COLUMNS,
    businessId,
    distinct(productIds),
  );
}

/** What to show when a name cannot be resolved at all. */
export const UNKNOWN_CUSTOMER = 'Unknown customer';
export const UNKNOWN_PRODUCT = 'Unknown item';
