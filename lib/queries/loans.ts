'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { markLoanRepaid } from '@/lib/actions/loan';
import type { LoanDirection } from '@/lib/validators/loan';

export type LoanRow = {
  id: string;
  party_name: string;
  direction: LoanDirection;
  principal_paisa: number;
  balance_paisa: number;
  loan_date: string;
  due_date: string | null;
  is_settled: boolean;
  notes: string | null;
  created_at: string;
};

export type LoanFilters = {
  directions: LoanDirection[]; // empty = all
  status: 'all' | 'pending' | 'repaid';
};

export function useLoans(filters: LoanFilters) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['loans', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('loans')
        .select(
          'id, party_name, direction, principal_paisa, balance_paisa, loan_date, due_date, is_settled, notes, created_at',
        )
        .eq('business_id', activeId!)
        .order('loan_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.directions.length > 0) q = q.in('direction', filters.directions);
      if (filters.status === 'pending') q = q.eq('is_settled', false);
      if (filters.status === 'repaid') q = q.eq('is_settled', true);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        principal_paisa: Number(r.principal_paisa),
        balance_paisa: Number(r.balance_paisa),
      })) as LoanRow[];
    },
  });
}

export function useMarkLoanRepaid() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  return useMutation({
    mutationFn: (id: string) => markLoanRepaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans', activeId] });
    },
  });
}
