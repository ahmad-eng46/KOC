'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import {
  brandSchema,
  assignBrandSchema,
  bulkAssignBrandSchema,
  type BrandInput,
  type AssignBrandInput,
  type BulkAssignBrandInput,
} from '@/lib/validators/brands';

type CreateResult = { ok: true; id: string; name: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };
type CountResult = { ok: true; count: number } | { ok: false; error: string };

const REVALIDATE = ['/products', '/products/new', '/settings/brands'];

function revalidateAll() {
  for (const p of REVALIDATE) revalidatePath(p);
}

async function requireManager(): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }
  return { ok: true };
}

function cleanBrand(data: BrandInput) {
  return {
    name: data.name.trim(),
    brand_type: data.brand_type,
    contact_person: data.contact_person || null,
    phone: data.phone || null,
    address: data.address || null,
    notes: data.notes || null,
    sort_order: data.sort_order ?? 0,
  };
}

export async function createBrand(input: BrandInput): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('brands')
    .insert({ business_id: businessId, ...cleanBrand(parsed.data) })
    .select('id, name')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `A brand named "${parsed.data.name.trim()}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, id: data.id, name: data.name };
}

export async function updateBrand(id: string, input: BrandInput): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('brands')
    .update(cleanBrand(parsed.data))
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `A brand named "${parsed.data.name.trim()}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, id, name: parsed.data.name.trim() };
}

/**
 * Soft delete, admin only. The brand's products are moved to Unbranded
 * (brand_id NULL) via the bulk RPC rather than left pointing at a hidden
 * brand — the count comes back so the UI can say "5 products were moved".
 */
export async function deleteBrand(id: string): Promise<CountResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete brands.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  const { data: productRows, error: listErr } = await supabase
    .from('products_for_role')
    .select('id')
    .eq('business_id', businessId)
    .eq('brand_id', id);
  if (listErr) return { ok: false, error: listErr.message };

  const ids = (productRows ?? []).map((r) => r.id as string);
  let moved = 0;
  if (ids.length > 0) {
    const { data: count, error: unassignErr } = await supabase.rpc('assign_products_brand', {
      p_product_ids: ids,
      p_brand_id: null,
    });
    if (unassignErr) return { ok: false, error: unassignErr.message };
    moved = Number(count ?? 0);
  }

  const { error } = await supabase
    .from('brands')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, count: moved };
}

/** Single assignment via the narrow RPC — staff allowed (brand ≠ price data). */
export async function assignProductBrand(input: AssignBrandInput): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant', 'staff'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = assignBrandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('assign_product_brand', {
    p_product_id: parsed.data.product_id,
    p_brand_id: parsed.data.brand_id,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

/** Bulk initial-setup assignment. admin/accountant (re-enforced in SQL). */
export async function bulkAssignBrand(input: BulkAssignBrandInput): Promise<CountResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = bulkAssignBrandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('assign_products_brand', {
    p_product_ids: parsed.data.product_ids,
    p_brand_id: parsed.data.brand_id,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, count: Number(data ?? 0) };
}
