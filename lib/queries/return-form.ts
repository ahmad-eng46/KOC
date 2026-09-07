'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { distributeInvoiceDiscount } from '@/lib/return-pricing';

export type ReturnableItem = {
  invoice_item_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  sold_quantity: number;
  /** The product's pack today, so a return can be entered by the box. */
  pack_size: number;
  pack_name: string | null;
  /** The list price on the invoice line, BEFORE the invoice-level discount. */
  unit_price_paisa: number;
  /**
   * What the customer actually paid per unit, once this line's share of the
   * invoice discount is taken off. This is what a refund is based on — equal
   * to unit_price_paisa when the invoice had no discount.
   */
  effective_unit_price_paisa: number;
  /** This line's share of the invoice discount, for the "you saved" note. */
  discount_share_paisa: number;
  already_returned: number;
  remaining: number;
};

export type ReturnFormData = {
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  customer_name: string;
  /** Flat amount off the whole invoice; 0 when there was none. */
  discount_paisa: number;
  items: ReturnableItem[];
};

export type ReturnableInvoice = {
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  total_paisa: number;
  item_count: number;
  /** Units still returnable across all the invoice's items. */
  returnable_quantity: number;
};

/**
 * A customer's invoices that still have something returnable, most recent
 * first — step 2 of the customer-first return flow. Remaining quantities
 * are computed the same way useReturnFormData does (sold − sum of
 * return_items on non-deleted returns).
 */
export function useReturnableInvoices(customerId: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['returnable-invoices', activeId, customerId],
    enabled: !!activeId && !!customerId,
    queryFn: async () => {
      const supabase = createClient();
      const [invRes, returnedRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, issue_date, total_paisa, invoice_items(id, quantity)')
          .eq('business_id', activeId!)
          .eq('customer_id', customerId)
          .is('deleted_at', null)
          .neq('status', 'draft')
          .neq('status', 'cancelled')
          .order('issue_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('return_items')
          .select('invoice_item_id, quantity, returns!inner(customer_id, deleted_at)')
          .eq('returns.customer_id', customerId)
          .is('returns.deleted_at', null),
      ]);
      if (invRes.error) throw invRes.error;
      if (returnedRes.error) throw returnedRes.error;

      const returnedByItem = new Map<string, number>();
      for (const r of returnedRes.data ?? []) {
        returnedByItem.set(
          r.invoice_item_id,
          (returnedByItem.get(r.invoice_item_id) ?? 0) + Number(r.quantity),
        );
      }

      type RawInvoice = {
        id: string;
        invoice_number: string;
        issue_date: string;
        total_paisa: number;
        invoice_items: Array<{ id: string; quantity: number }> | null;
      };

      return ((invRes.data ?? []) as unknown as RawInvoice[])
        .map((inv) => {
          const items = inv.invoice_items ?? [];
          const returnable = items.reduce(
            (sum, it) =>
              sum + Math.max(Number(it.quantity) - (returnedByItem.get(it.id) ?? 0), 0),
            0,
          );
          return {
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
            issue_date: inv.issue_date,
            total_paisa: Number(inv.total_paisa),
            item_count: items.length,
            returnable_quantity: returnable,
          } as ReturnableInvoice;
        })
        .filter((inv) => inv.returnable_quantity > 0);
    },
  });
}

export function useReturnFormData(invoiceId: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['return-form', activeId, invoiceId],
    enabled: !!activeId && !!invoiceId,
    queryFn: async () => {
      const supabase = createClient();

      const [invRes, itemsRes, returnedRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, issue_date, discount_paisa, customers(name)')
          .eq('id', invoiceId)
          .eq('business_id', activeId!)
          .is('deleted_at', null)
          .single(),
        // Ordered by (created_at, id) to match invoice_item_effective_prices()
        // in 0048 — the order decides which line absorbs the rounding remainder.
        supabase
          .from('invoice_items')
          .select(
            'id, product_id, quantity, unit_price_paisa, line_total_paisa, product_name_snapshot, product_sku_snapshot, product_unit_snapshot',
          )
          .eq('invoice_id', invoiceId)
          .order('created_at')
          .order('id'),
        // All return_items for this invoice's items, joined to (non-deleted) returns
        supabase
          .from('return_items')
          .select('invoice_item_id, quantity, returns!inner(invoice_id, deleted_at)')
          .eq('returns.invoice_id', invoiceId)
          .is('returns.deleted_at', null),
      ]);

      if (invRes.error) throw invRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (returnedRes.error) throw returnedRes.error;

      type RawCustomer = { name: string };
      const inv = invRes.data as unknown as {
        id: string;
        invoice_number: string;
        issue_date: string;
        discount_paisa: number | null;
        customers: RawCustomer | RawCustomer[] | null;
      };
      const cust = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;

      // Sum already-returned per invoice_item_id
      const returnedMap = new Map<string, number>();
      for (const r of returnedRes.data ?? []) {
        const cur = returnedMap.get(r.invoice_item_id) ?? 0;
        returnedMap.set(r.invoice_item_id, cur + Number(r.quantity));
      }

      type RawItem = {
        id: string;
        product_id: string;
        quantity: number;
        unit_price_paisa: number;
        line_total_paisa: number;
        product_name_snapshot: string | null;
        product_sku_snapshot: string | null;
        product_unit_snapshot: string | null;
      };
      const rawItems = itemsRes.data as unknown as RawItem[];

      /**
       * Names via product_identity rather than an embed through the products
       * foreign key: that embed reads the base table, which staff may not
       * SELECT because the cost price is on it, so every line came back
       * nameless for exactly the people processing returns.
       */
      type Identity = {
        id: string;
        name: string;
        sku: string | null;
        unit: string;
        pack_size: number;
        pack_name: string | null;
      };
      const names = new Map<string, Identity>();
      const productIds = Array.from(new Set(rawItems.map((it) => it.product_id)));
      if (productIds.length > 0) {
        const { data: idRows, error: idErr } = await supabase
          .from('product_identity')
          .select('id, name, sku, unit, pack_size, pack_name')
          .eq('business_id', activeId!)
          .in('id', productIds);
        // Non-fatal for the same reason as the invoice detail: a missing name
        // must not stop someone processing a return.
        if (!idErr) {
          for (const row of (idRows ?? []) as Identity[]) names.set(row.id, row);
        }
      }

      // The invoice discount is a flat amount off the total, so each line's
      // list price overstates what was paid for it. Spread it before showing
      // any price a refund will be based on.
      const discountPaisa = Number(inv.discount_paisa ?? 0);
      const effective = new Map(
        distributeInvoiceDiscount(
          rawItems.map((it) => ({
            id: it.id,
            quantity: Number(it.quantity),
            lineTotalPaisa: Number(it.line_total_paisa),
          })),
          discountPaisa,
        ).map((e) => [e.id, e]),
      );

      const items = rawItems.map((it) => {
        const p = names.get(it.product_id);
        const sold = Number(it.quantity);
        const already = returnedMap.get(it.id) ?? 0;
        const eff = effective.get(it.id);
        return {
          invoice_item_id: it.id,
          product_id: it.product_id,
          // Snapshot first — a return must describe what the invoice sold, not
          // what the catalogue happens to call it today.
          product_name: it.product_name_snapshot ?? p?.name ?? 'Unknown item',
          sku: it.product_sku_snapshot ?? p?.sku ?? null,
          unit: it.product_unit_snapshot ?? p?.unit ?? '',
          pack_size: Number(p?.pack_size ?? 1),
          pack_name: p?.pack_name ?? null,
          sold_quantity: sold,
          unit_price_paisa: Number(it.unit_price_paisa),
          effective_unit_price_paisa: eff?.effectiveUnitPricePaisa ?? Number(it.unit_price_paisa),
          discount_share_paisa: eff?.discountSharePaisa ?? 0,
          already_returned: already,
          remaining: sold - already,
        } as ReturnableItem;
      });

      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date,
        customer_name: cust?.name ?? 'Unknown customer',
        discount_paisa: discountPaisa,
        items,
      } as ReturnFormData;
    },
  });
}
