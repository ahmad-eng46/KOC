'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/actions/activity-log';
import { formatPKR } from '@/lib/money';
import { currentUserCan } from '@/lib/auth/can-user';
import { invoiceCreateSchema, type InvoiceCreateInput } from '@/lib/validators/invoice';
import { computeInvoiceTotals } from '@/lib/invoice';
import { findStockShortages, formatShortageError } from '@/lib/stock';
import { salePriceIsUnset } from '@/lib/validators/product';
import {
  findRateOverrides, describeOverride, type RateOverrideCandidate,
} from '@/lib/rate-override';

export type CreateInvoiceResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createInvoice(input: InvoiceCreateInput): Promise<CreateInvoiceResult> {
  // 1. Auth
  const session = await getSession();
  if (!session || !(await currentUserCan('invoices.create'))) {
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

  /**
   * What the form would have suggested, recomputed here rather than taken from
   * the request. A rate the browser claims it was offered is not evidence of
   * anything (iron rule #7).
   *
   * Read before the invoice is written, so this sale cannot become its own
   * "last sold" answer.
   */
  const suggestedByProduct = await suggestedRates(
    supabase, productIds, data.customer_id,
  );

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
      // Carried through untouched — the RPC stores them for the PDF and does
      // no arithmetic with them. quantity above is units, as it always was.
      entered_quantity: it.entered_quantity ?? null,
      entry_mode: it.entry_mode ?? null,
      pack_size_snapshot: it.pack_size_snapshot ?? null,
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

  const { data: customer } = await supabase
    .from('customers')
    .select('name')
    .eq('id', data.customer_id)
    .single();
  const customerName = (customer as { name: string } | null)?.name ?? 'a customer';

  await logActivity({
    action: 'invoice.created',
    entityType: 'invoice',
    entityId: invoiceId as string,
    description: `Created an invoice for ${customerName} (${formatPKR(totals.total_paisa)})`,
    metadata: {
      customer_id: data.customer_id,
      customer_name: customerName,
      total_paisa: totals.total_paisa,
      items: data.items.length,
    },
  });

  await logRateOverrides({
    supabase,
    invoiceId: invoiceId as string,
    invoiceItems: data.items,
    suggestedByProduct,
    productNames,
    actorRole: session.role,
    customerName,
  });

  revalidatePath('/invoices');
  revalidatePath('/stock');
  revalidatePath('/products');

  return { ok: true, id: invoiceId as string };
}

type Db = Awaited<ReturnType<typeof createServerClient>>;

/**
 * The rate the form would have pre-filled for each product: what it last sold
 * for, else the product's own price, else nothing.
 *
 * Mirrors useLastSoldRates on the client deliberately — if the two disagree,
 * every line looks like an override. Falls back to the sale price when 0067 is
 * not applied, which is exactly what the form does in that case too.
 */
async function suggestedRates(
  supabase: Db,
  productIds: string[],
  customerId: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  const { data: products } = await supabase
    .from('products_for_role')
    .select('id, sale_price_paisa')
    .in('id', productIds);

  for (const p of (products ?? []) as { id: string; sale_price_paisa: number }[]) {
    if (!salePriceIsUnset(p.sale_price_paisa)) out.set(p.id, Number(p.sale_price_paisa));
  }

  const { data: sold, error } = await supabase.rpc('last_sold_rates', {
    p_product_ids: productIds,
    p_customer_id: customerId,
  });

  // 0067 may not be applied; the sale price fallback above still stands.
  if (!error) {
    for (const row of (sold ?? []) as { product_id: string; unit_price_paisa: number }[]) {
      out.set(row.product_id, Number(row.unit_price_paisa));
    }
  }

  return out;
}

/**
 * Record lines billed at something other than the suggested rate.
 *
 * Notify only: this runs after the invoice is safely created and its failure
 * must never fail the sale. Admin overrides are not recorded — the admin sets
 * the prices, so their departing from one is not news.
 */
async function logRateOverrides(args: {
  supabase: Db;
  invoiceId: string;
  invoiceItems: { product_id: string; unit_price_paisa: number }[];
  suggestedByProduct: Map<string, number>;
  productNames: Map<string, string>;
  actorRole: string;
  customerName: string;
}): Promise<void> {
  const {
    supabase, invoiceId, invoiceItems, suggestedByProduct,
    productNames, actorRole, customerName,
  } = args;

  // The admin sets the prices; their departing from one is not news. The view
  // in 0068 filters admins out too, so this is belt and braces.
  if (actorRole === 'admin') return;

  try {
    // The cost snapshot the RPC took, which is the only cost figure available
    // here: products_for_role returns NULL to the staff session that is running
    // this code. Used to set a boolean and never returned to the client.
    const { data: rows } = await supabase
      .from('invoice_items')
      .select('product_id, purchase_price_at_sale_paisa')
      .eq('invoice_id', invoiceId);

    const costByProduct = new Map<string, number>(
      (rows ?? []).map((r: { product_id: string; purchase_price_at_sale_paisa: number }) =>
        [r.product_id, Number(r.purchase_price_at_sale_paisa)]),
    );

    const candidates: RateOverrideCandidate[] = invoiceItems.map((it) => ({
      productId: it.product_id,
      productName: productNames.get(it.product_id) ?? 'a product',
      suggestedPaisa: suggestedByProduct.get(it.product_id) ?? null,
      enteredPaisa: it.unit_price_paisa,
      costPaisa: costByProduct.get(it.product_id) ?? null,
    }));

    for (const override of findRateOverrides(candidates)) {
      await logActivity({
        action: 'invoice.rate_overridden',
        entityType: 'invoice',
        entityId: invoiceId,
        description:
          `Rate changed on an invoice for ${customerName} — `
          + describeOverride(override, formatPKR),
        metadata: {
          invoice_id: invoiceId,
          customer_name: customerName,
          product_id: override.productId,
          product_name: override.productName,
          suggested_rate_paisa: override.suggestedPaisa,
          entered_rate_paisa: override.enteredPaisa,
          difference_paisa: override.differencePaisa,
          difference_percent: override.differencePercent,
          below_cost: override.belowCost,
        },
      });
    }
  } catch {
    // A notice is not worth failing a saved sale over.
  }
}
