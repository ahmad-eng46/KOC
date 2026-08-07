'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { expenseCreateSchema, type ExpenseCreateInput } from '@/lib/validators/expense';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

export async function createExpense(input: ExpenseCreateInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'expenses.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = expenseCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  // asset_name / sub_type_name are denormalised — and the asset↔category
  // match validated (Transport↔Maintenance counting as one group) — by the
  // trg_expenses_denormalize trigger, so no insert path can skip it. Its
  // error messages are already user-readable and surface as-is below.
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      business_id: businessId,
      type: parsed.data.type,
      category: parsed.data.category,
      description: parsed.data.description || null,
      amount_paisa: parsed.data.amount_paisa,
      expense_date: parsed.data.expense_date,
      include_in_pnl: parsed.data.type === 'business', // home expenses opt-in via settings toggle
      receipt_url: parsed.data.receipt_url ?? null,
      asset_id: parsed.data.asset_id ?? null,
      sub_type_id: parsed.data.sub_type_id ?? null,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed.' };

  revalidatePath('/expenses');
  return { ok: true, id: data.id };
}

export async function softDeleteExpense(id: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete expenses.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/expenses');
  return { ok: true };
}
