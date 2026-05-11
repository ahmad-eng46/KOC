'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { can, type Role } from '@/lib/auth/permissions';
import { productSchema, type ProductInput } from '@/lib/validators/product';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createProduct(input: ProductInput): Promise<ActionResult> {
  const { profile } = await requireAuth();
  if (!can(profile.role as Role, 'products.create')) {
    throw new Error('Permission denied: products.create');
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('products')
    .insert({ ...parsed.data, business_id: businessId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/products');
  return { ok: true, id: data.id };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  const { profile } = await requireAuth();
  if (!can(profile.role as Role, 'products.update')) {
    throw new Error('Permission denied: products.update');
  }

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('products')
    .update(parsed.data)
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
