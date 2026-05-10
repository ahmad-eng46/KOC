'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { loanCreateSchema, type LoanCreateInput } from '@/lib/validators/loan';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

export async function createLoan(input: LoanCreateInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can record loans.' };
  }

  const parsed = loanCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('loans')
    .insert({
      business_id: businessId,
      party_name: parsed.data.party_name,
      direction: parsed.data.direction,
      principal_paisa: parsed.data.principal_paisa,
      balance_paisa: parsed.data.principal_paisa, // starts at full principal
      loan_date: parsed.data.loan_date,
      due_date: parsed.data.due_date || null,
      notes: parsed.data.notes || null,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed.' };

  revalidatePath('/loans');
  return { ok: true, id: data.id };
}

export async function markLoanRepaid(id: string): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can settle loans.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('loans')
    .update({ is_settled: true, balance_paisa: 0 })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/loans');
  return { ok: true };
}
