'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type LedgerRow = {
  id: string;
  ref_type: 'opening' | 'invoice' | 'payment' | 'return' | 'adjustment';
  ref_id: string | null;
  entry_date: string;
  created_at: string;
  description: string;
  debit_paisa: number;
  credit_paisa: number;
  running_balance: number;
};

/**
 * Live customer ledger via the customer_ledger() Postgres RPC.
 * Includes synthetic Opening Balance row first; running_balance is computed
 * via SQL window function (SUM over rows). Never stored client-side.
 */
export function useCustomerLedger(customerId: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['customer-ledger', activeId, customerId],
    enabled: !!activeId && !!customerId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('customer_ledger', {
        p_customer_id: customerId,
      });
      if (error) throw error;
      return (data ?? []).map((r: LedgerRow) => ({
        ...r,
        debit_paisa: Number(r.debit_paisa),
        credit_paisa: Number(r.credit_paisa),
        running_balance: Number(r.running_balance),
      })) as LedgerRow[];
    },
  });
}
