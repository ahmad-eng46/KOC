'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type CustomerWithBalance = {
  id: string;
  name: string;
  phone: string | null;
  current_balance_paisa: number; // opening + (sum debits - sum credits), server-computed
};

/**
 * Customers + their live current balance, from customer_balances_view
 * (migration 0042) — the same opening + SUM(debit − credit) the customer
 * ledger, the reports and the invoice PDF's previous-balance RPC use.
 *
 * Replaces the old client-side ledger aggregation, which silently degraded
 * to opening-balance-only numbers for staff/viewer (ledger_entries RLS is
 * admin/accountant). The view is an owner view: business isolation via
 * user_has_business(), true balances for every role — sale-side money is
 * not price data.
 */
export function useCustomersWithBalance() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers-with-balance', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customer_balances_view')
        .select('customer_id, name, phone, current_balance_paisa')
        .eq('business_id', activeId!)
        .order('name');
      if (error) throw error;

      return (data ?? []).map((r) => ({
        id: r.customer_id as string,
        name: r.name as string,
        phone: (r.phone as string | null) ?? null,
        current_balance_paisa: Number(r.current_balance_paisa ?? 0),
      })) as CustomerWithBalance[];
    },
  });
}
