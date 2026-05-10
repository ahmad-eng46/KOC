'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { returnCreateSchema, type ReturnCreateInput } from '@/lib/validators/return';

type CreateReturnResult = { ok: true; id: string } | { ok: false; error: string };

export async function createReturn(input: ReturnCreateInput): Promise<CreateReturnResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'returns.create')) {
    return { ok: false, error: 'Only admin or accountant can process returns.' };
  }

  const parsed = returnCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createServerClient();
  const { data: returnId, error } = await supabase.rpc('create_return_atomic', {
    p_input: parsed.data,
  });

  if (error) return { ok: false, error: error.message };
  if (!returnId) return { ok: false, error: 'Return creation returned no id.' };

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${parsed.data.invoice_id}`);
  revalidatePath('/stock');

  return { ok: true, id: returnId as string };
}
