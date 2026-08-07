'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import {
  locationSchema,
  assignLocationSchema,
  bulkAssignLocationSchema,
  type LocationInput,
  type AssignLocationInput,
  type BulkAssignLocationInput,
} from '@/lib/validators/locations';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };
type BulkResult = { ok: true; updated: number } | { ok: false; error: string };

export async function createLocation(input: LocationInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('locations')
    .insert({
      business_id: businessId,
      name: parsed.data.name.trim(),
      short_code: parsed.data.short_code || null,
      sort_order: parsed.data.sort_order ?? 0,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = the case-insensitive (business_id, name) unique index
    if (error.code === '23505') {
      return { ok: false, error: `A city named "${parsed.data.name.trim()}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/locations');
  return { ok: true, id: data.id };
}

export async function updateLocation(
  id: string,
  input: LocationInput,
): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('locations')
    .update({
      name: parsed.data.name.trim(),
      short_code: parsed.data.short_code || null,
      sort_order: parsed.data.sort_order ?? 0,
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `A city named "${parsed.data.name.trim()}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/locations');
  revalidatePath(`/locations/${id}`);
  return { ok: true, id };
}

/**
 * Soft delete, admin only. Refused while customers are still assigned — the
 * caller should reassign them first (the error carries the count so the UI
 * can say so). This also guarantees no customer ends up pointing at a
 * location the active lists no longer show.
 */
export async function deleteLocation(id: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete locations.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  const { count, error: countErr } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('location_id', id)
    .is('deleted_at', null);

  if (countErr) return { ok: false, error: countErr.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} customer${count === 1 ? ' is' : 's are'} assigned to this location. Reassign them first.`,
    };
  }

  const { error } = await supabase
    .from('locations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/locations');
  return { ok: true };
}

/**
 * Set (or clear, with location_id: null) one customer's city.
 * Delegates to the SECURITY DEFINER RPC so staff can do it despite
 * customers_update RLS being admin/accountant-only.
 */
export async function assignCustomerLocation(
  input: AssignLocationInput,
): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant', 'staff'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = assignLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc('assign_customer_location', {
    p_customer_id: parsed.data.customer_id,
    p_location_id: parsed.data.location_id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/locations');
  revalidatePath('/customers');
  revalidatePath(`/customers/${parsed.data.customer_id}`);
  return { ok: true };
}

/** Bulk initial-setup assignment. Admin/accountant only (enforced again in SQL). */
export async function bulkAssignLocation(
  input: BulkAssignLocationInput,
): Promise<BulkResult> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = bulkAssignLocationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('assign_customers_location', {
    p_customer_ids: parsed.data.customer_ids,
    p_location_id: parsed.data.location_id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/locations');
  revalidatePath('/customers');
  return { ok: true, updated: Number(data ?? 0) };
}
