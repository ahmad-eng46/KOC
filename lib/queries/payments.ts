'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { fetchCustomerNames, UNKNOWN_CUSTOMER } from '@/lib/identity';
import { useBusinessStore } from '@/lib/store/business';
import { softDeletePayment } from '@/lib/actions/payment';
import type { PaymentMethod } from '@/lib/validators/payment';

export type PaymentListRow = {
  id: string;
  payment_date: string;
  amount_paisa: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  customer_id: string;
  customer_name: string;
  invoice_id: string | null;
  invoice_number: string | null;
  created_at: string;
};

export type PaymentFilters = {
  from: string;
  to: string;
  methods: PaymentMethod[]; // empty = all
};

export function usePayments(filters: PaymentFilters) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['payments', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('payments')
        .select(
          'id, payment_date, amount_paisa, method, reference, notes, customer_id, invoice_id, created_at, invoices(invoice_number)',
        )
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('payment_date', filters.from)
        .lte('payment_date', filters.to)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.methods.length > 0) {
        q = q.in('method', filters.methods);
      }

      const { data, error } = await q;
      if (error) throw error;

      type RawInvoice = { invoice_number: string };
      type Raw = Omit<PaymentListRow, 'customer_name' | 'invoice_number'> & {
        invoices: RawInvoice | RawInvoice[] | null;
      };
      const rows = (data as unknown as Raw[]) ?? [];

      /**
       * The payer's name comes from customer_identity, not from an embed
       * through the customers foreign key: that embed is subject to
       * customers_select, which hides soft-deleted rows, so a receipt from a
       * since-deleted customer showed no payer at all. One query for the page.
       */
      const names = await fetchCustomerNames(
        supabase, activeId!, rows.map((r) => r.customer_id),
      );

      return rows.map((r) => {
        const i = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
        return {
          ...r,
          amount_paisa: Number(r.amount_paisa),
          customer_name: r.customer_id
            ? names.get(r.customer_id)?.name ?? UNKNOWN_CUSTOMER
            : '—',
          invoice_number: i?.invoice_number ?? null,
        } as PaymentListRow;
      });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      softDeletePayment(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments', activeId] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-balance', activeId] });
    },
  });
}
