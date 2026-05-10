'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';

export type InvestmentRow = {
  id: string;
  investor_name: string;
  description: string | null;
  amount_paisa: number;
  investment_date: string;
  notes: string | null;
  created_at: string;
};

export function useInvestments() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['investments', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('investments')
        .select('id, investor_name, description, amount_paisa, investment_date, notes, created_at')
        .eq('business_id', activeId!)
        .order('investment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        amount_paisa: Number(r.amount_paisa),
      })) as InvestmentRow[];
    },
  });
}
