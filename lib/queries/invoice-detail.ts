'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { fetchProductNames } from '@/lib/queries/product-names';
import type { InvoiceStatus } from '@/lib/queries/invoices';

// The RPC returns a BIGINT, which supabase-js may surface as number or string.
const previousBalanceSchema = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => (v === null ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), 'Invalid previous balance');

export type InvoiceDetail = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  subtotal_paisa: number;
  discount_paisa: number;
  total_paisa: number;
  paid_paisa: number;
  notes: string | null;
  created_at: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  business_name: string;
  /**
   * Customer balance immediately before this invoice was posted, from the
   * invoice_previous_balance() RPC (SECURITY DEFINER, business-scoped).
   * null when unavailable — callers must degrade, never guess.
   */
  previous_balance_paisa: number | null;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    sku: string | null;
    unit: string;
    quantity: number;
    /** What the user typed, and in what — null on rows written before packs. */
    entered_quantity: number | null;
    entry_mode: 'unit' | 'pack' | null;
    pack_name: string | null;
    unit_price_paisa: number;
    discount_paisa: number;
    line_total_paisa: number;
  }>;
  payments: Array<{
    id: string;
    amount_paisa: number;
    method: string;
    reference: string | null;
    payment_date: string;
    created_at: string;
  }>;
  returns: Array<{
    id: string;
    return_number: string;
    return_date: string;
    total_paisa: number;
    items: Array<{
      product_name: string;
      quantity: number;
      /** Refund per unit — the invoiced price unless overridden. */
      return_price_paisa: number;
      is_price_overridden: boolean;
      override_reason: string | null;
    }>;
  }>;
};

/**
 * The columns an invoice line has always had, and the ones 0066 added.
 *
 * Kept apart because the app deploys ahead of its migrations. Naming a column
 * PostgREST does not know about fails the whole request, so an invoice would
 * go from "no product name" to "Invoice not found" purely because a migration
 * had not been pasted yet. The line's money must render either way.
 */
const ITEM_COLUMNS =
  'id, product_id, quantity, unit_price_paisa, discount_paisa, line_total_paisa, ' +
  'entered_quantity, entry_mode, pack_size_snapshot';
const ITEM_SNAPSHOT_COLUMNS =
  'product_name_snapshot, product_sku_snapshot, product_unit_snapshot';

/** Full select where the schema allows it, the older one where it does not. */
async function fetchInvoiceItems(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
) {
  const withSnapshot = await supabase
    .from('invoice_items')
    .select(`${ITEM_COLUMNS}, ${ITEM_SNAPSHOT_COLUMNS}`)
    .eq('invoice_id', invoiceId)
    .order('created_at');

  if (!withSnapshot.error) return withSnapshot;
  if (!withSnapshot.error.message.includes('product_name_snapshot')) return withSnapshot;

  return supabase
    .from('invoice_items')
    .select(ITEM_COLUMNS)
    .eq('invoice_id', invoiceId)
    .order('created_at');
}

export function useInvoiceDetail(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['invoice-detail', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();

      const [invRes, itemsRes, paysRes, returnsRes, prevBalRes] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'id, invoice_number, status, issue_date, due_date, subtotal_paisa, discount_paisa, total_paisa, paid_paisa, notes, created_at, customer_id, customers(name, phone, address), businesses(name)',
          )
          .eq('id', id)
          .eq('business_id', activeId!)
          .is('deleted_at', null)
          .single(),
        fetchInvoiceItems(supabase, id),
        supabase
          .from('payments')
          .select('id, amount_paisa, method, reference, payment_date, created_at')
          .eq('invoice_id', id)
          .is('deleted_at', null)
          .order('created_at'),
        supabase
          .from('returns')
          .select(
            'id, return_number, return_date, total_paisa, return_items(product_id, quantity, return_price_paisa, is_price_overridden, override_reason)',
          )
          .eq('invoice_id', id)
          .is('deleted_at', null)
          .order('created_at'),
        supabase.rpc('invoice_previous_balance', { p_invoice_id: id }),
      ]);

      if (invRes.error) throw invRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (paysRes.error) throw paysRes.error;
      if (returnsRes.error) throw returnsRes.error;

      /**
       * Names come from product_identity, not from an embed through the
       * products foreign key. That embed reads the base table, whose SELECT
       * policy is admin/accountant only because the cost price lives there —
       * so for staff it returned null and every line rendered as "—".
       * products_for_role would not do either: it hides deleted rows, and an
       * old invoice may name a product that has since been deleted.
       */
      // Cast once: the two selects in fetchInvoiceItems give supabase-js two
      // different row shapes, and everything below reads the older one plus
      // three optional fields.
      const itemRows = (itemsRes.data ?? []) as unknown as RawItem[];

      const productIds = Array.from(
        new Set<string>([
          ...itemRows.map((it) => String(it.product_id)),
          ...(returnsRes.data ?? []).flatMap((r) =>
            ((r.return_items ?? []) as Array<{ product_id: string }>).map((ri) =>
              String(ri.product_id),
            ),
          ),
        ]),
      );

      const names = await fetchProductNames(supabase, activeId!, productIds);

      // A missing previous balance must not break the invoice view — the PDF
      // falls back to the simple totals block instead.
      const prevBalance = prevBalRes.error
        ? null
        : (previousBalanceSchema.safeParse(prevBalRes.data).data ?? null);

      type RawCustomer = { name: string; phone: string | null; address: string | null };
      type RawBusiness = { name: string };
      const inv = invRes.data as unknown as {
        id: string;
        invoice_number: string;
        status: InvoiceStatus;
        issue_date: string;
        due_date: string | null;
        subtotal_paisa: number;
        discount_paisa: number;
        total_paisa: number;
        paid_paisa: number;
        notes: string | null;
        created_at: string;
        customer_id: string;
        customers: RawCustomer | RawCustomer[] | null;
        businesses: RawBusiness | RawBusiness[] | null;
      };

      const c = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
      const b = Array.isArray(inv.businesses) ? inv.businesses[0] : inv.businesses;

      type RawItem = {
        id: string;
        product_id: string;
        quantity: number;
        entered_quantity: number | null;
        entry_mode: 'unit' | 'pack' | null;
        unit_price_paisa: number;
        discount_paisa: number;
        line_total_paisa: number;
        product_name_snapshot?: string | null;
        product_sku_snapshot?: string | null;
        product_unit_snapshot?: string | null;
      };
      const items = itemRows.map((it) => {
        const p = names.get(it.product_id);
        return {
          id: it.id,
          product_id: it.product_id,
          // Snapshot first: it says what was sold, which a rename or a
          // deletion must not be able to change. The live catalogue is only a
          // fallback for lines written before 0066.
          product_name: it.product_name_snapshot ?? p?.name ?? 'Unknown item',
          sku: it.product_sku_snapshot ?? p?.sku ?? null,
          unit: it.product_unit_snapshot ?? p?.unit ?? '',
          quantity: Number(it.quantity),
          entered_quantity: it.entered_quantity == null ? null : Number(it.entered_quantity),
          entry_mode: it.entry_mode ?? null,
          pack_name: p?.pack_name ?? null,
          unit_price_paisa: Number(it.unit_price_paisa),
          discount_paisa: Number(it.discount_paisa),
          line_total_paisa: Number(it.line_total_paisa),
        };
      });

      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        subtotal_paisa: Number(inv.subtotal_paisa),
        discount_paisa: Number(inv.discount_paisa),
        total_paisa: Number(inv.total_paisa),
        paid_paisa: Number(inv.paid_paisa),
        notes: inv.notes,
        created_at: inv.created_at,
        customer_id: inv.customer_id,
        customer_name: c?.name ?? 'Unknown customer',
        customer_phone: c?.phone ?? null,
        customer_address: c?.address ?? null,
        business_name: b?.name ?? '—',
        previous_balance_paisa: prevBalance,
        items,
        payments: (paysRes.data ?? []).map((p) => ({
          ...p,
          amount_paisa: Number(p.amount_paisa),
        })),
        returns: (returnsRes.data ?? []).map((r) => {
          type RawReturnItem = {
            product_id: string;
            quantity: number;
            return_price_paisa: number;
            is_price_overridden: boolean;
            override_reason: string | null;
          };
          const rawItems = (r.return_items ?? []) as unknown as RawReturnItem[];
          return {
            id: r.id as string,
            return_number: r.return_number as string,
            return_date: r.return_date as string,
            total_paisa: Number(r.total_paisa),
            items: rawItems.map((ri) => {
              const p = names.get(ri.product_id);
              return {
                product_name: p?.name ?? 'Unknown item',
                quantity: Number(ri.quantity),
                return_price_paisa: Number(ri.return_price_paisa),
                is_price_overridden: Boolean(ri.is_price_overridden),
                override_reason: ri.override_reason ?? null,
              };
            }),
          };
        }),
      } as InvoiceDetail;
    },
  });
}
