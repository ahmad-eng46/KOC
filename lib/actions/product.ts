'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { productSchemaFor, type ProductInput } from '@/lib/validators/product';
import { roleAllowsCostPrice } from '@/lib/auth/permissions';
import { logActivity } from '@/lib/actions/activity-log';
import { softDeleteEntity } from '@/lib/actions/soft-delete';

type ActionResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

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
 *
 * Purchase price is deliberately NOT coerced here. NULL means "leave the cost
 * price alone" to update_product_as_role, so flattening it to 0 in the shared
 * helper would let a staff edit erase a price they cannot even see. The insert
 * path, where the column's NOT NULL applies, coerces at the call site instead.
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

/**
 * A product saved without a cost price. Staff cannot supply one, so this is
 * the marker an admin needs to come back and complete it. Carried in the
 * activity metadata that the admin notification feed already reads, rather
 * than in a second queue of its own.
 */
function costMissing(data: ProductInput): boolean {
  return !data.purchase_price_paisa;
}

/**
 * Turn a SKU collision into something actionable.
 *
 * Postgres reports it as
 *     duplicate key value violates unique constraint "idx_products_sku"
 * which names the index rather than the product, and the product holding the
 * code may be soft-deleted and therefore invisible everywhere in the app —
 * so the owner sees a database error about a conflict they cannot find.
 *
 * 0071 stops deleted products holding a SKU at all. This covers the live case,
 * and any database where 0071 has not been applied yet.
 */
async function explainSkuClash(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  businessId: string,
  sku: string | null | undefined,
  fallback: string,
): Promise<string> {
  if (!sku) return fallback;

  // products, not products_for_role: the row may be soft-deleted, which is
  // exactly the case that needs explaining.
  const { data } = await supabase
    .from('products')
    .select('name, deleted_at')
    .eq('business_id', businessId)
    .eq('sku', sku)
    .limit(1);

  const holder = (data ?? [])[0] as { name: string; deleted_at: string | null } | undefined;
  if (!holder) return fallback;

  if (holder.deleted_at) {
    return `SKU "${sku}" still belongs to "${holder.name}", which was deleted `
      + 'on ' + holder.deleted_at.slice(0, 10)
      + '. Restore that product instead, or use a different SKU.';
  }
  return `SKU "${sku}" is already used by "${holder.name}". Use a different one.`;
}

/** Postgres unique-violation. */
function isDuplicateKey(code: string | undefined): boolean {
  return code === '23505';
}

/**
 * Opening stock: what is already on the shelf when the product is first
 * recorded.
 *
 * Written as one ordinary stock_movements row of type 'in', because stock in
 * this app is a ledger and not a column — current_stock sums the movements.
 * A product created without it simply has no movement, which reads as 0, so
 * blank means no row rather than a row of zero.
 *
 * Quantity is in base units. The form converts from packs before calling.
 */

export async function createProduct(
  input: ProductInput,
  openingStockUnits?: number | null,
): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('products.create'))) {
    throw new Error('Permission denied: products.create');
  }

  // Purchase price is required of the roles that can see it. Staff cannot, so
  // the same schema asks less of them rather than asking the impossible.
  const session = await getSession();
  const canSeeCost = !!session && roleAllowsCostPrice(session.role);

  const parsed = productSchemaFor(canSeeCost).safeParse(input);
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
    .insert({
      ...values,
      sku: values.sku ?? null,
      // NOT NULL column; only a staff save reaches here without a price.
      purchase_price_paisa: values.purchase_price_paisa ?? 0,
      id,
      business_id: businessId,
    });

  if (error) {
    return {
      ok: false,
      error: isDuplicateKey(error.code)
        ? await explainSkuClash(supabase, businessId, values.sku, error.message)
        : error.message,
    };
  }

  await logActivity({
    action: 'product.created',
    entityType: 'product',
    entityId: id,
    description: `Added product ${values.name}`,
    metadata: {
      name: values.name,
      sku: values.sku ?? null,
      // Read by the admin notification feed: a staff-added product still
      // needs a cost price before it can appear truthfully in the books.
      purchase_price_missing: costMissing(values),
    },
  });

  // The product is saved by this point. If the opening movement fails the
  // product still exists, so the caller is told rather than shown a plain
  // success it would have to discover was only half true.
  let warning: string | undefined;
  const opening = Number(openingStockUnits ?? 0);
  if (Number.isFinite(opening) && opening > 0) {
    const { error: stockError } = await supabase.from('stock_movements').insert({
      business_id: businessId,
      product_id: id,
      type: 'in',
      quantity: opening,
      note: 'Opening stock',
    });
    if (stockError) {
      warning =
        `${values.name} was saved, but its opening stock could not be recorded `
        + `(${stockError.message}). Add it from the Stock page.`;
    } else {
      await logActivity({
        action: 'stock.adjusted',
        entityType: 'product',
        entityId: id,
        description: `Opening stock for ${values.name}: ${opening} ${values.unit}`,
        metadata: { product_id: id, type: 'in', quantity: opening, opening_stock: true },
      });
    }
  }

  revalidatePath('/products');
  revalidatePath('/stock');
  return { ok: true, id, warning };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('products.update'))) {
    throw new Error('Permission denied: products.update');
  }

  const session = await getSession();
  const canSeeCost = !!session && roleAllowsCostPrice(session.role);

  const parsed = productSchemaFor(canSeeCost).safeParse(input);
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

  if (error) {
    return {
      ok: false,
      error: isDuplicateKey(error.code)
        ? await explainSkuClash(supabase, businessId, values.sku, error.message)
        : error.message,
    };
  }

  await logActivity({
    action: 'product.updated',
    entityType: 'product',
    entityId: id,
    description: `Updated product ${values.name}`,
    metadata: {
      name: values.name,
      sku: values.sku ?? null,
      purchase_price_missing: canSeeCost ? costMissing(values) : undefined,
    },
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

/**
 * Bring a deleted product back, with its history attached.
 *
 * The gap this fills: 51 deleted products in this business hold 349 stock
 * movements and 274 invoice lines between them. Recreating one by hand starts
 * it at zero stock and leaves all of that stranded on a row nobody can see,
 * so retyping a product is strictly worse than restoring it — there was simply
 * no way to restore.
 *
 * Admin only, matching softDeleteProduct: whoever may remove a product from
 * the catalogue is who may put it back.
 *
 * The SKU is the one thing that may not survive. 0071 frees a deleted
 * product's SKU for reuse, so by the time anyone restores, the code may belong
 * to something else — and two live products cannot share one. Rather than fail
 * with a duplicate-key error, the restore clears the SKU and says so; the
 * product, its stock and its invoices all come back either way, and a SKU is
 * a label that can be retyped.
 */
export async function restoreProduct(
  id: string,
): Promise<{ ok: true; skuCleared: boolean } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can restore a product.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  // products, not products_for_role: the row being restored is soft-deleted,
  // which is precisely what that view hides.
  const { data: rows, error: readError } = await supabase
    .from('products')
    .select('id, name, sku, deleted_at')
    .eq('id', id)
    .eq('business_id', businessId)
    .limit(1);

  if (readError) return { ok: false, error: readError.message };

  const product = (rows ?? [])[0] as
    { id: string; name: string; sku: string | null; deleted_at: string | null } | undefined;

  if (!product) return { ok: false, error: 'Product not found.' };
  if (!product.deleted_at) return { ok: false, error: `${product.name} is not deleted.` };

  // Would the SKU collide with a live product once this one is live again?
  let skuCleared = false;
  if (product.sku) {
    const { data: taken } = await supabase
      .from('products')
      .select('id')
      .eq('business_id', businessId)
      .eq('sku', product.sku)
      .is('deleted_at', null)
      .limit(1);
    skuCleared = (taken ?? []).length > 0;
  }

  const { error } = await supabase
    .from('products')
    .update({
      deleted_at: null,
      is_active: true,
      ...(skuCleared ? { sku: null } : {}),
    })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'product.updated',
    entityType: 'product',
    entityId: id,
    description: `Restored product ${product.name}`
      + (skuCleared ? ` — its SKU "${product.sku}" was taken, so it was cleared` : ''),
    metadata: {
      name: product.name,
      restored: true,
      sku_cleared: skuCleared,
      previous_sku: skuCleared ? product.sku : null,
    },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  revalidatePath('/stock');
  return { ok: true, skuCleared };
}
