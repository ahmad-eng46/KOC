'use server';

import { createServerClient } from '@/lib/supabase/server';

/**
 * Entity types the database registry knows. Kept in step with
 * public.deletable_entities — 0060 seeds exactly these.
 */
export type DeletableEntityType =
  | 'invoice' | 'customer' | 'product' | 'expense' | 'payment' | 'return'
  | 'supplier' | 'stock_purchase' | 'supplier_payment' | 'brand' | 'location'
  | 'customer_category' | 'expense_asset' | 'expense_sub_type';

export type SoftDeleteResult =
  | { ok: true; snapshot: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * The single soft delete. Every delete action funnels through here.
 *
 * A plain `UPDATE ... SET deleted_at` cannot work from the client: Postgres
 * checks the new row against the table's SELECT policies, and every one of
 * those policies filters `deleted_at IS NULL`, so setting it produces a row the
 * caller may not see and the write is refused. 0060 explains this at length,
 * with the experiments. The RPC is SECURITY DEFINER for that reason and
 * re-imposes the admin and business checks itself.
 *
 * Callers keep their own business rules — restoring stock, unassigning
 * products, detaching customers. This owns only the moment the row is marked
 * deleted, and hands back what it looked like beforehand.
 */
export async function softDeleteEntity(
  entityType: DeletableEntityType,
  id: string,
  businessId: string,
  notes?: string,
): Promise<SoftDeleteResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('soft_delete_entity', {
    p_entity_type: entityType,
    p_id: id,
    p_business_id: businessId,
    p_notes: notes ?? null,
  });

  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, snapshot: (data ?? {}) as Record<string, unknown> };
}

/**
 * The RPC's exceptions arrive as Postgres error text. These three are the ones
 * a user can actually cause, so they get sentences rather than diagnostics.
 */
function friendly(message: string): string {
  if (message.includes('Only an admin')) {
    return 'Only an admin can delete records.';
  }
  if (message.includes('Record not found')) {
    return 'That record no longer exists, or has already been deleted.';
  }
  if (message.includes('Not your business')) {
    return 'That record belongs to a different business.';
  }
  return message;
}
