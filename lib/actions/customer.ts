'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { requireAuth } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import {
  customerSchema, customerUpdateSchema,
  type CustomerInput,
} from '@/lib/validators/customer';
import { logActivity } from '@/lib/actions/activity-log';
import { todayKarachiISO } from '@/lib/date';
import { softDeleteEntity } from '@/lib/actions/soft-delete';

type ActionResult =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

export async function createCustomer(input: CustomerInput): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('customers.create'))) {
    throw new Error('Permission denied: customers.create');
  }

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  /**
   * The opening balance is stored as a ledger entry, not on the customer row.
   * 0075 moved every existing one there so a balance stays explainable by the
   * entries underneath it; writing the column here would put money straight
   * back into the place that migration emptied, one new customer at a time.
   */
  const openingPaisa = Number(parsed.data.opening_balance_paisa ?? 0);

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...parsed.data, opening_balance_paisa: 0, business_id: businessId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  let warning: string | undefined;
  if (openingPaisa !== 0) {
    const { error: ledgerError } = await supabase.rpc('post_customer_opening_balance', {
      p_customer_id: data.id,
      p_business_id: businessId,
      p_amount_paisa: openingPaisa,
      p_entry_date: null,
    });

    if (ledgerError) {
      // The customer exists by now. Saying the save failed would be worse than
      // saying which half did not land.
      warning = ledgerError.code === 'PGRST202' || ledgerError.code === '42883'
        ? `${parsed.data.name} was saved, but the opening balance needs migration 0077. Apply it, then set the balance from the customer page.`
        : `${parsed.data.name} was saved, but the opening balance could not be recorded (${ledgerError.message}).`;
    }
  }

  await logActivity({
    action: 'customer.created',
    entityType: 'customer',
    entityId: data.id,
    description: `Added customer ${parsed.data.name}`,
    metadata: {
      name: parsed.data.name,
      opening_balance_paisa: openingPaisa,
      opening_balance_posted: openingPaisa !== 0 && !warning,
    },
  });

  revalidatePath('/customers');
  revalidatePath('/ledger');
  return { ok: true, id: data.id, warning };
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<ActionResult> {
  await requireAuth();
  if (!(await currentUserCan('customers.update'))) {
    throw new Error('Permission denied: customers.update');
  }

  // Not customerSchema: that one carries opening_balance_paisa, and whatever
  // it parsed went straight into .update(). An edit must not be able to reach
  // the balance column at all.
  const parsed = customerUpdateSchema.safeParse(input);
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
  // Was enforced by RLS alone, which admits accountants (customers_update) —
  // so an accountant could delete any customer with no gate and no reason on
  // record. Iron rule #7: the server checks too. Non-admins request instead.
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete customers. Request approval instead.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const deleted = await softDeleteEntity('customer', id, businessId);
  if (!deleted.ok) return { ok: false, error: deleted.error };

  revalidatePath('/customers');
  return { ok: true };
}

/**
 * Move a customer's balance to a figure the admin states, by posting the
 * difference as a dated ledger entry.
 *
 * NOT an UPDATE of a balance column. A balance that is overwritten stops being
 * explainable by the invoices and payments underneath it, and nothing records
 * that it moved. 0075 turns opening balances into ledger entries for the same
 * reason; this is the ongoing half of it.
 *
 * The arithmetic lives in adjust_customer_balance (0075): it reads the current
 * balance and posts the difference in one statement, so two admins correcting
 * the same customer at once cannot both apply their own idea of the delta.
 *
 * Takes the TARGET balance rather than a delta because that is what the admin
 * is looking at, and because a target applied twice is a no-op while a delta
 * applied twice is a second correction.
 */
export async function adjustCustomerBalance(input: {
  customerId: string;
  targetBalancePaisa: number;
  reason: string;
  entryDate?: string | null;
  /** Which balance is being corrected. Defaults to where the account stands now. */
  field?: 'outstanding' | 'opening';
}): Promise<
  | { ok: true; oldBalancePaisa: number; newBalancePaisa: number; differencePaisa: number }
  | { ok: false; error: string }
> {
  await requireAuth();
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  // Admin only, and said here as well as in the function — iron rule #7.
  if (session.role !== 'admin') {
    return { ok: false, error: 'Only an admin can adjust a balance.' };
  }

  if (!Number.isInteger(input.targetBalancePaisa)) {
    return { ok: false, error: 'Enter a valid amount.' };
  }
  const reason = input.reason?.trim() ?? '';
  if (reason.length < 3) {
    return { ok: false, error: 'Say why the balance is being changed.' };
  }

  // An entry dated in the future misstates every report drawn before it
  // arrives. Refused here and again in the function.
  if (input.entryDate && input.entryDate > todayKarachiISO()) {
    return { ok: false, error: 'An adjustment cannot be dated in the future.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('adjust_customer_balance', {
    p_customer_id: input.customerId,
    p_business_id: businessId,
    p_target_balance_paisa: input.targetBalancePaisa,
    p_reason: reason,
    p_entry_date: input.entryDate ?? null,
    p_field: input.field ?? 'outstanding',
  });

  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      return {
        ok: false,
        error: 'Adjusting a balance needs migrations 0075 and 0080. Apply them and try again.',
      };
    }
    if (error.message.includes('future')) {
      return { ok: false, error: 'An adjustment cannot be dated in the future.' };
    }
    if (error.message.includes('already the balance')) {
      return { ok: false, error: 'That is already the balance — nothing to change.' };
    }
    return { ok: false, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    old_balance_paisa?: number; new_balance_paisa?: number;
    difference_paisa?: number; entry_id?: string;
  } | null;

  const oldBalance = Number(row?.old_balance_paisa ?? 0);
  const newBalance = Number(row?.new_balance_paisa ?? input.targetBalancePaisa);
  const difference = Number(row?.difference_paisa ?? 0);

  // No logActivity() here: 0080 writes the audit row inside the function,
  // in the same transaction as the ledger entry, so a correction can never
  // exist without its record. Logging again would double it.

  revalidatePath('/customers');
  revalidatePath(`/customers/${input.customerId}`);
  revalidatePath('/ledger');
  return { ok: true, oldBalancePaisa: oldBalance, newBalancePaisa: newBalance, differencePaisa: difference };
}
