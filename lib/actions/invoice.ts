'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { invoiceCreateSchema, type InvoiceCreateInput } from '@/lib/validators/invoice';
import { computeInvoiceTotals } from '@/lib/invoice';
import { findStockShortages, formatShortageError } from '@/lib/stock';

export type CreateInvoiceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createInvoice(input: InvoiceCreateInput): Promise<CreateInvoiceResult> {
  // 1. Auth
  const session = await getSession();
  if (!session || !can(session.role, 'invoices.create')) {
    return { ok: false, error: 'Insufficient permissions.' };
  }

  // 2. Validate input
  const parsed = invoiceCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  // Item-level invariants (zod guards positive/non-negative — assert defensively)
  for (const it of data.items) {
    if (it.quantity <= 0) return { ok: false, error: 'Quantity must be greater than 0.' };
    if (it.unit_price_paisa < 0) return { ok: false, error: 'Rate cannot be negative.' };
  }

  // 3. Business id
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  // 4. Recompute totals SERVER-SIDE
  const totals = computeInvoiceTotals(
    data.items,
    data.discount_type,
    data.discount_value,
  );

  // 5. Stock check — blocks the sale; create_invoice_atomic enforces this
  //    again in-transaction, where concurrent invoices are serialised.
  const supabase = await createServerClient();
  const productIds = Array.from(new Set(data.items.map((it) => it.product_id)));

  const [stockRes, productRes] = await Promise.all([
    supabase
      .from('current_stock')
      .select('product_id, quantity_on_hand')
      .eq('business_id', businessId)
      .in('product_id', productIds),
    supabase
      .from('products_for_role')
      .select('id, name')
      .eq('business_id', businessId)
      .in('id', productIds),
  ]);

  const stockMap = new Map<string, number>(
    (stockRes.data ?? []).map((s) => [s.product_id, Number(s.quantity_on_hand)]),
  );
  const productNames = new Map<string, string>(
    (productRes.data ?? []).map((p) => [p.id, p.name]),
  );

  const shortages = findStockShortages(data.items, stockMap, productNames);
  if (shortages.length > 0) {
    return { ok: false, error: formatShortageError(shortages) };
  }

  // 6. Atomic creation via RPC
  const rpcInput = {
    business_id: businessId,
    customer_id: data.customer_id,
    issue_date: data.issue_date || null,
    due_date: data.due_date || null,
    discount_paisa: totals.discount_paisa,
    notes: data.notes || null,
    items: data.items.map((it, i) => ({
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price_paisa: it.unit_price_paisa,
      discount_paisa: it.discount_paisa ?? 0,
      line_total_paisa: totals.line_totals_paisa[i],
    })),
    payment:
      data.payment_received_paisa > 0
        ? {
            amount_paisa: data.payment_received_paisa,
            method: data.payment_method,
            reference: data.payment_reference || null,
            payment_date: data.issue_date || null,
          }
        : null,
  };

  const { data: invoiceId, error } = await supabase.rpc('create_invoice_atomic', {
    p_input: rpcInput,
  });

  if (error) return { ok: false, error: error.message };
  if (!invoiceId) return { ok: false, error: 'Invoice creation returned no id.' };

  revalidatePath('/invoices');
  revalidatePath('/stock');
  revalidatePath('/products');

  return { ok: true, id: invoiceId as string };
}
