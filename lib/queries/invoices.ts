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
          'id, invoice_number, status, issue_date, due_date, subtotal_paisa, discount_paisa, total_paisa, paid_paisa, customer_id, created_at',
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

      type Row = Omit<InvoiceListRow, 'customer_name' | 'customer_phone'>;
      const rows = (data as unknown as Row[]) ?? [];

      /**
       * Names come from customer_identity, not from an embed through the
       * customers foreign key. That embed is subject to customers_select,
       * which filters deleted_at IS NULL, so deleting a customer blanked their
       * name on every invoice they ever had. One extra query for the whole
       * page, not one per row.
       */
      const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean)));
      const byId = new Map<string, { name: string; phone: string | null }>();
      if (ids.length > 0) {
        const { data: people } = await supabase
          .from('customer_identity')
          .select('id, name, phone')
          .in('id', ids);
        for (const p of (people ?? []) as { id: string; name: string; phone: string | null }[]) {
          byId.set(p.id, { name: p.name, phone: p.phone });
        }
      }

      return rows.map((r) => {
        const c = byId.get(r.customer_id);
        return {
          ...r,
          customer_name: c?.name ?? '—',
          customer_phone: c?.phone ?? null,
        } as InvoiceListRow;
      });
    },
  });
}
