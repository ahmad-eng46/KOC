'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { paymentCreateSchema, type PaymentCreateInput } from '@/lib/validators/payment';

type CreateResult = { ok: true; id: string } | { ok: false; error: string };
type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * Record a payment from a customer.
 * Trigger fn_ledger_on_payment fires automatically → creates a credit entry,
 * which reduces the customer's running balance.
 *
 * If invoice_id is provided, also updates that invoice's paid_paisa + status.
 */
export async function createPayment(input: PaymentCreateInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'payments.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const parsed = paymentCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();

  // Verify customer exists in this business (defence in depth)
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('id')
    .eq('id', data.customer_id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();
  if (custErr || !cust) return { ok: false, error: 'Customer not found in this business.' };

  // Insert payment — trigger fires ledger credit
  const { data: pay, error } = await supabase
    .from('payments')
    .insert({
      business_id: businessId,
      customer_id: data.customer_id,
      invoice_id: data.invoice_id ?? null,
      amount_paisa: data.amount_paisa,
      method: data.method,
      reference: data.reference || null,
      payment_date: data.payment_date,
      notes: data.notes || null,
      created_by: session.id,
    })
    .select('id')
    .single();

  if (error || !pay) return { ok: false, error: error?.message ?? 'Insert failed.' };

  // If linked to an invoice, update that invoice's paid_paisa + status
  if (data.invoice_id) {
    const { data: inv } = await supabase
      .from('invoices')
      .select('total_paisa, paid_paisa')
      .eq('id', data.invoice_id)
      .eq('business_id', businessId)
      .single();
    if (inv) {
      const newPaid = inv.paid_paisa + data.amount_paisa;
      const newStatus =
        newPaid >= inv.total_paisa ? 'paid' : newPaid > 0 ? 'partially_paid' : 'issued';
      await supabase
        .from('invoices')
        .update({ paid_paisa: newPaid, status: newStatus })
        .eq('id', data.invoice_id);
    }
  }

  revalidatePath('/payments');
  revalidatePath(`/customers/${data.customer_id}`);
  if (data.invoice_id) revalidatePath(`/invoices/${data.invoice_id}`);

  return { ok: true, id: pay.id };
}

/**
 * Soft-delete a payment. Admin only. Reason appended to notes.
 *
 * NOTE: Does NOT reverse the ledger credit. To unwind a wrongly-recorded
 * payment, file an offsetting adjustment via a separate flow (post-MVP).
 * For now, deletion is for hygiene; the ledger entry remains.
 */
export async function softDeletePayment(
  id: string,
  reason: string,
): Promise<SimpleResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete payments.' };
  }
  if (!reason.trim()) {
    return { ok: false, error: 'A reason is required.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data: existing, error: readErr } = await supabase
    .from('payments')
    .select('notes, customer_id, invoice_id')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (readErr || !existing) return { ok: false, error: 'Payment not found.' };

  const stamp = new Date().toISOString().slice(0, 10);
  const newNotes =
    `[DELETED ${stamp} by ${session.email}: ${reason.trim()}]` +
    (existing.notes ? `\n${existing.notes}` : '');

  const { error } = await supabase
    .from('payments')
    .update({ deleted_at: new Date().toISOString(), notes: newNotes })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/payments');
  revalidatePath(`/customers/${existing.customer_id}`);
  if (existing.invoice_id) revalidatePath(`/invoices/${existing.invoice_id}`);

  return { ok: true };
}
