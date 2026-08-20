'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { currentUserCan } from '@/lib/auth/can-user';
import { productSchema, type ProductInput } from '@/lib/validators/product';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * A blank pack name means "no pack", and no pack means a pack size of 1 —
 * otherwise a product could carry a size of 12 with nothing to call it and the
 * forms would have no word for what they were converting to.
 */
function normalisePack(data: ProductInput): ProductInput {
  const packName = data.pack_name?.trim() || null;
  return {
    ...data,
    pack_name: packName,
    pack_size: packName ? data.pack_size : 1,
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
  const values = normalisePack(parsed.data);

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('products')
    .insert({ ...values, business_id: businessId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/products');
  return { ok: true, id: data.id };
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
  const values = normalisePack(parsed.data);

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('products')
    .update(values)
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/products');
  revalidatePath(`/products/${id}`);
  return { ok: true, id };
}

export async function softDeleteProduct(id: string): Promise<{ ok: boolean; error?: string }> {
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/products');
  return { ok: true };
}
