'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type CustomerWithBalance = {
  id: string;
  name: string;
  phone: string | null;
  opening_balance_paisa: number;
  current_balance_paisa: number; // opening + (sum debits - sum credits) from ledger_entries
};

/**
 * Customers + their live current balance.
 *
 *   current_balance_paisa = opening_balance_paisa
 *                         + sum(ledger_entries.debit_paisa - credit_paisa)
 *
 * Ledger entries are aggregated client-side. For ~hundreds of entries this
 * is trivial; if/when we have many thousands, swap to a SQL RPC or view.
 */
export function useCustomersWithBalance() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customers-with-balance', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();

      const [custRes, ledgerRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, phone, opening_balance_paisa')
          .eq('business_id', activeId!)
          .is('deleted_at', null)
          .order('name'),
        supabase
          .from('ledger_entries')
          .select('customer_id, debit_paisa, credit_paisa')
          .eq('business_id', activeId!),
      ]);

      if (custRes.error) throw custRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      const deltaByCustomer = new Map<string, number>();
      for (const e of ledgerRes.data ?? []) {
        const cur = deltaByCustomer.get(e.customer_id) ?? 0;
        deltaByCustomer.set(
          e.customer_id,
          cur + Number(e.debit_paisa) - Number(e.credit_paisa),
        );
      }

      return (custRes.data ?? []).map((c) => ({
        ...c,
        current_balance_paisa:
          c.opening_balance_paisa + (deltaByCustomer.get(c.id) ?? 0),
      })) as CustomerWithBalance[];
    },
  });
}
