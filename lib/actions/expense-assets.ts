'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import {
  expenseAssetSchema,
  expenseSubTypeSchema,
  expenseCategoryGroup,
  type ExpenseAssetInput,
  type ExpenseSubTypeInput,
} from '@/lib/validators/expense-assets';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

const REVALIDATE = ['/expenses', '/expenses/new', '/settings/expense-assets', '/reports/expenses'];

function revalidateAll() {
  for (const p of REVALIDATE) revalidatePath(p);
}

async function requireManager(): Promise<
  { ok: true; role: 'admin' | 'accountant' } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session || !['admin', 'accountant'].includes(session.role)) {
    return { ok: false, error: 'Insufficient permissions.' };
  }
  return { ok: true, role: session.role as 'admin' | 'accountant' };
}

export async function createExpenseAsset(input: ExpenseAssetInput): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = expenseAssetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('expense_assets')
    .insert({
      business_id: businessId,
      category: parsed.data.category,
      name: parsed.data.name.trim(),
      asset_type: parsed.data.asset_type || null,
      details: parsed.data.details ?? {},
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `"${parsed.data.name.trim()}" already exists in ${parsed.data.category}.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, id: data.id };
}

export async function updateExpenseAsset(
  id: string,
  input: ExpenseAssetInput,
): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = expenseAssetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('expense_assets')
    .update({
      category: parsed.data.category,
      name: parsed.data.name.trim(),
      asset_type: parsed.data.asset_type || null,
      details: parsed.data.details ?? {},
    })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `"${parsed.data.name.trim()}" already exists in ${parsed.data.category}.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, id };
}

/**
 * Soft delete, admin only. Linked expenses keep their denormalised
 * asset_name (verified in the 0043 migration tests), so history stays
 * labelled — the returned message tells the caller how many rows that is.
 */
export async function deleteExpenseAsset(
  id: string,
): Promise<SimpleResult & { linkedCount?: number }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete assets.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  const { count } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('asset_id', id)
    .is('deleted_at', null);

  const { error } = await supabase
    .from('expense_assets')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, linkedCount: count ?? 0 };
}

export async function createExpenseSubType(input: ExpenseSubTypeInput): Promise<CreateResult> {
  const gate = await requireManager();
  if (!gate.ok) return gate;

  const parsed = expenseSubTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('expense_sub_types')
    .insert({
      business_id: businessId,
      category: parsed.data.category,
      name: parsed.data.name.trim(),
      sort_order: parsed.data.sort_order ?? 999,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: `"${parsed.data.name.trim()}" already exists in ${parsed.data.category}.` };
    }
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, id: data.id };
}

export async function deleteExpenseSubType(id: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete expense types.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('expense_sub_types')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

export type ExpenseAssetOption = {
  id: string;
  category: string;
  name: string;
  asset_type: string | null;
};

export type ExpenseSubTypeOption = {
  id: string;
  category: string;
  name: string;
  sort_order: number;
};

/**
 * Server-side dropdown fetchers. The form itself prefetches via the client
 * hooks; these exist for RSC callers and match the spec's action list.
 * Category filtering honours the Transport↔Maintenance group.
 */
export async function getAssetsByCategory(category: string): Promise<ExpenseAssetOption[]> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return [];

  const { data } = await supabase
    .from('expense_assets')
    .select('id, category, name, asset_type')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('category', expenseCategoryGroup(category))
    .order('name');
  return (data ?? []) as ExpenseAssetOption[];
}

export async function getSubTypesByCategory(category: string): Promise<ExpenseSubTypeOption[]> {
  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return [];

  const { data } = await supabase
    .from('expense_sub_types')
    .select('id, category, name, sort_order')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('category', expenseCategoryGroup(category))
    .order('sort_order')
    .order('name');
  return (data ?? []) as ExpenseSubTypeOption[];
}
