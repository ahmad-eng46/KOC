'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';

export type InvoiceListRow = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  subtotal_paisa: number;
  discount_paisa: number;
  total_paisa: number;
  paid_paisa: number;
  customer_id: string;
  created_at: string;
  // Joined customer
  customer_name: string;
  customer_phone: string | null;
};

export type InvoiceFilters = {
  from: string; // ISO date YYYY-MM-DD (issue_date >=)
  to: string;   // ISO date YYYY-MM-DD (issue_date <=)
  statuses: InvoiceStatus[]; // empty = all (excluding draft/cancelled below)
};

export function useInvoices(filters: InvoiceFilters) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['invoices', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('invoices')
        .select(
          'id, invoice_number, status, issue_date, due_date, subtotal_paisa, discount_paisa, total_paisa, paid_paisa, customer_id, created_at, customers(name, phone)',
        )
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('issue_date', filters.from)
        .lte('issue_date', filters.to)
        .neq('status', 'draft')
        .neq('status', 'cancelled')
        .order('issue_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.statuses.length > 0) {
        query = query.in('status', filters.statuses);
      }

      const { data, error } = await query;
      if (error) throw error;

      type Row = Omit<InvoiceListRow, 'customer_name' | 'customer_phone'> & {
        customers: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
      };

      return (data as unknown as Row[]).map((r) => {
        const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
        return {
          ...r,
          customer_name: c?.name ?? '—',
          customer_phone: c?.phone ?? null,
        } as InvoiceListRow;
      });
    },
  });
}
