'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { investmentCreateSchema, type InvestmentCreateInput } from '@/lib/validators/investment';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };

export async function createInvestment(input: InvestmentCreateInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can record investments.' };
  }

  const parsed = investmentCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('investments')
    .insert({
      business_id: businessId,
      investor_name: parsed.data.investor_name,
      description: parsed.data.description || null,
      amount_paisa: parsed.data.amount_paisa,
      investment_date: parsed.data.investment_date,
      notes: parsed.data.notes || null,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed.' };

  revalidatePath('/investments');
  return { ok: true, id: data.id };
}
