'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
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
        supabase
          .from('invoice_items')
          .select('id, product_id, quantity, unit_price_paisa, discount_paisa, line_total_paisa, entered_quantity, entry_mode, pack_size_snapshot')
          .eq('invoice_id', id)
          .order('created_at'),
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
      const productIds = Array.from(
        new Set<string>([
          ...(itemsRes.data ?? []).map((it) => String(it.product_id)),
          ...(returnsRes.data ?? []).flatMap((r) =>
            ((r.return_items ?? []) as Array<{ product_id: string }>).map((ri) =>
              String(ri.product_id),
            ),
          ),
        ]),
      );

      type Identity = {
        id: string;
        name: string;
        sku: string | null;
        unit: string;
        pack_name: string | null;
      };
      const names = new Map<string, Identity>();
      if (productIds.length > 0) {
        const { data: idRows, error: idErr } = await supabase
          .from('product_identity')
          .select('id, name, sku, unit, pack_name')
          .eq('business_id', activeId!)
          .in('id', productIds);
        // Deliberately not thrown. A name is a label; the invoice is money.
        // If this lookup fails — 0065 not applied yet, a stale PostgREST schema
        // cache — the lines still show their quantities, rates and totals with
        // "—" for the name, which is what they did before 0065 anyway. Taking
        // the whole invoice down over a caption would be the worse trade.
        if (!idErr) {
          for (const row of (idRows ?? []) as Identity[]) names.set(row.id, row);
        }
      }

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
      };
      const items = (itemsRes.data as unknown as RawItem[]).map((it) => {
        const p = names.get(it.product_id);
        return {
          id: it.id,
          product_id: it.product_id,
          product_name: p?.name ?? '—',
          sku: p?.sku ?? null,
          unit: p?.unit ?? '',
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
        customer_name: c?.name ?? '—',
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
                product_name: p?.name ?? '—',
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
