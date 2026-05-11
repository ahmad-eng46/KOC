'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { can, type Role } from '@/lib/auth/permissions';
import { customerSchema, type CustomerInput } from '@/lib/validators/customer';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createCustomer(input: CustomerInput): Promise<ActionResult> {
  const { profile } = await requireAuth();
  if (!can(profile.role as Role, 'customers.create')) {
    throw new Error('Permission denied: customers.create');
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...parsed.data, business_id: businessId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/customers');
  return { ok: true, id: data.id };
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<ActionResult> {
  const { profile } = await requireAuth();
  if (!can(profile.role as Role, 'customers.update')) {
    throw new Error('Permission denied: customers.update');
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('customers')
    .update(parsed.data)
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
  return { ok: true, id };
}

export async function softDeleteCustomer(id: string): Promise<{ ok: boolean; error?: string }> {
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/customers');
  return { ok: true };
}
