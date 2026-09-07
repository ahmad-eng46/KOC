'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { productSchema, type ProductInput } from '@/lib/validators/product';
import { logActivity } from '@/lib/actions/activity-log';
import { softDeleteEntity } from '@/lib/actions/soft-delete';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A blank pack name means "no pack", and no pack means a pack size of 1 —
 * otherwise a product could carry a size of 12 with nothing to call it and the
 * forms would have no word for what they were converting to.
 *
 * A blank SKU becomes NULL, which is not cosmetic. idx_products_sku is
 * UNIQUE (business_id, sku) WHERE sku IS NOT NULL, and an empty string is not
 * null — so storing '' lets the first product without a SKU save and makes
 * every one after it fail on a duplicate key. Blank means absent.
 *
 * A blank low-stock alert becomes 0, matching the column's own default. The
 * form leaves it null, and passing that null explicitly overrides the DEFAULT
 * and trips the NOT NULL constraint, so saving a product without an alert
 * failed with a raw Postgres message.
 */
function normalise(data: ProductInput): ProductInput {
  const packName = data.pack_name?.trim() || null;
  return {
    ...data,
    sku: data.sku?.trim() || undefined,
    pack_name: packName,
    pack_size: packName ? data.pack_size : 1,
    low_stock_threshold: data.low_stock_threshold ?? 0,
  };
}

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('products.create'))) {
    throw new Error('Permission denied: products.create');
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const values = normalise(parsed.data);

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  // The id is generated here rather than read back with .select(). Staff hold
  // INSERT on products but deliberately not SELECT — the base table carries the
  // cost price — and a RETURNING clause is subject to the SELECT policy, so
  // asking for the row back would fail for exactly the role this exists for.
  const id = randomUUID();

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('products')
    .insert({ ...values, sku: values.sku ?? null, id, business_id: businessId });

  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'product.created',
    entityType: 'product',
    entityId: id,
    description: `Added product ${values.name}`,
    metadata: { name: values.name, sku: values.sku ?? null },
  });

  revalidatePath('/products');
  return { ok: true, id };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('products.update'))) {
    throw new Error('Permission denied: products.update');
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const values = normalise(parsed.data);

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  // Not a direct table UPDATE: that statement's WHERE clause is subject to the
  // SELECT policy, which staff do not satisfy, so it would match zero rows and
  // report no error — a form that says "Saved" and saved nothing. The RPC also
  // decides for itself who may move the cost price, so the rule lives in one
  // place instead of being re-stated by every caller.
  const supabase = await createServerClient();
  const { error } = await supabase.rpc('update_product_as_role', {
    p_id: id,
    p_business_id: businessId,
    p_name: values.name,
    p_sku: values.sku?.trim() || null,
    p_unit: values.unit,
    p_sale_price_paisa: values.sale_price_paisa,
    p_low_stock_threshold: values.low_stock_threshold ?? 0,
    p_brand_id: values.brand_id ?? null,
    p_pack_size: values.pack_size,
    p_pack_name: values.pack_name,
    p_is_active: values.is_active,
    p_purchase_price_paisa: values.purchase_price_paisa ?? null,
  });

  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'product.updated',
    entityType: 'product',
    entityId: id,
    description: `Updated product ${values.name}`,
    metadata: { name: values.name, sku: values.sku ?? null },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  return { ok: true, id };
}

export async function softDeleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  // Deliberately still the direct table UPDATE, and deliberately not routed
  // through update_product_as_role: products_update stays admin-only, which is
  // what keeps a soft delete out of staff's reach now that they can edit
  // products by other means. Checked here too — iron rule #7.
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete products. Request approval instead.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const deleted = await softDeleteEntity('product', id, businessId);
  if (!deleted.ok) return { ok: false, error: deleted.error };

  revalidatePath('/products');
  return { ok: true };
}
