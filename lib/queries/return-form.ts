'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type ReturnableItem = {
  invoice_item_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  sold_quantity: number;
  unit_price_paisa: number;
  already_returned: number;
  remaining: number;
};

export type ReturnFormData = {
  invoice_id: string;
  invoice_number: string;
  issue_date: string;
  customer_name: string;
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
          .select('id, invoice_number, issue_date, customers(name)')
          .eq('id', invoiceId)
          .eq('business_id', activeId!)
          .is('deleted_at', null)
          .single(),
        supabase
          .from('invoice_items')
          .select('id, product_id, quantity, unit_price_paisa, products(name, sku, unit)')
          .eq('invoice_id', invoiceId)
          .order('created_at'),
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
        products:
          | { name: string; sku: string | null; unit: string }
          | { name: string; sku: string | null; unit: string }[]
          | null;
      };
      const items = (itemsRes.data as unknown as RawItem[]).map((it) => {
        const p = Array.isArray(it.products) ? it.products[0] : it.products;
        const sold = Number(it.quantity);
        const already = returnedMap.get(it.id) ?? 0;
        return {
          invoice_item_id: it.id,
          product_id: it.product_id,
          product_name: p?.name ?? '—',
          sku: p?.sku ?? null,
          unit: p?.unit ?? '',
          sold_quantity: sold,
          unit_price_paisa: Number(it.unit_price_paisa),
          already_returned: already,
          remaining: sold - already,
        } as ReturnableItem;
      });

      return {
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        issue_date: inv.issue_date,
        customer_name: cust?.name ?? '—',
        items,
      } as ReturnFormData;
    },
  });
}
