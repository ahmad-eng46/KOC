'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import type { InvoiceStatus } from '@/lib/queries/invoices';

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
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    sku: string | null;
    unit: string;
    quantity: number;
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
  }>;
};

export function useInvoiceDetail(id: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['invoice-detail', activeId, id],
    enabled: !!activeId && !!id,
    queryFn: async () => {
      const supabase = createClient();

      const [invRes, itemsRes, paysRes, returnsRes] = await Promise.all([
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
          .select('id, product_id, quantity, unit_price_paisa, discount_paisa, line_total_paisa, products(name, sku, unit)')
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
          .select('id, return_number, return_date, total_paisa')
          .eq('invoice_id', id)
          .is('deleted_at', null)
          .order('created_at'),
      ]);

      if (invRes.error) throw invRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (paysRes.error) throw paysRes.error;
      if (returnsRes.error) throw returnsRes.error;

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
        unit_price_paisa: number;
        discount_paisa: number;
        line_total_paisa: number;
        products:
          | { name: string; sku: string | null; unit: string }
          | { name: string; sku: string | null; unit: string }[]
          | null;
      };
      const items = (itemsRes.data as unknown as RawItem[]).map((it) => {
        const p = Array.isArray(it.products) ? it.products[0] : it.products;
        return {
          id: it.id,
          product_id: it.product_id,
          product_name: p?.name ?? '—',
          sku: p?.sku ?? null,
          unit: p?.unit ?? '',
          quantity: Number(it.quantity),
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
        items,
        payments: (paysRes.data ?? []).map((p) => ({
          ...p,
          amount_paisa: Number(p.amount_paisa),
        })),
        returns: (returnsRes.data ?? []).map((r) => ({
          ...r,
          total_paisa: Number(r.total_paisa),
        })),
      } as InvoiceDetail;
    },
  });
}
