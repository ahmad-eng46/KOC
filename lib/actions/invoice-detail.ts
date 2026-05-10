'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Soft-delete an invoice. Admin only. Reason is appended to the notes field
 * (the audit_log trigger already records the UPDATE; the reason is captured
 * inline so it surfaces in the UI without joining audit data).
 *
 * NOTE: We do NOT reverse the ledger debit. Returns are the proper way to
 * unwind an invoice's financial impact. Soft delete is for hygiene only.
 */
export async function softDeleteInvoice(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete invoices.' };
  }
  if (!reason.trim()) {
    return { ok: false, error: 'A reason is required.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data: existing, error: readErr } = await supabase
    .from('invoices')
    .select('notes')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (readErr || !existing) return { ok: false, error: 'Invoice not found.' };

  const stamp = new Date().toISOString().slice(0, 10);
  const newNotes =
    `[DELETED ${stamp} by ${session.email}: ${reason.trim()}]` +
    (existing.notes ? `\n${existing.notes}` : '');

  const { error } = await supabase
    .from('invoices')
    .update({ deleted_at: new Date().toISOString(), notes: newNotes })
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/**
 * Records a payment for the outstanding balance on an invoice.
 * Trigger creates a ledger credit; we then update invoice.paid_paisa + status.
 * Admin / accountant only.
 */
export async function markInvoicePaid(id: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session || !can(session.role, 'payments.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const supabase = await createServerClient();
  const { data: inv, error: readErr } = await supabase
    .from('invoices')
    .select('id, customer_id, total_paisa, paid_paisa, status')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (readErr || !inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status === 'paid') return { ok: false, error: 'Invoice already fully paid.' };
  if (inv.status === 'cancelled') return { ok: false, error: 'Cannot mark a cancelled invoice as paid.' };

  const outstanding = inv.total_paisa - inv.paid_paisa;
  if (outstanding <= 0) return { ok: false, error: 'No outstanding balance.' };

  // Insert payment for the outstanding amount (trigger fires ledger credit)
  const { error: payErr } = await supabase.from('payments').insert({
    business_id: businessId,
    customer_id: inv.customer_id,
    invoice_id: inv.id,
    amount_paisa: outstanding,
    method: 'cash',
    notes: 'Marked paid from invoice detail',
    created_by: session.id,
  });
  if (payErr) return { ok: false, error: payErr.message };

  // Update invoice status
  const { error: invErr } = await supabase
    .from('invoices')
    .update({ paid_paisa: inv.total_paisa, status: 'paid' })
    .eq('id', id)
    .eq('business_id', businessId);
  if (invErr) return { ok: false, error: invErr.message };

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}
