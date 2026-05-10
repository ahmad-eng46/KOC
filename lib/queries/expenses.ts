'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { softDeleteExpense } from '@/lib/actions/expense';
import type { ExpenseType } from '@/lib/validators/expense';

export type ExpenseRow = {
  id: string;
  type: ExpenseType;
  category: string;
  description: string | null;
  amount_paisa: number;
  expense_date: string;
  include_in_pnl: boolean;
  receipt_url: string | null;
  created_at: string;
};

export type ExpenseFilters = {
  from: string;
  to: string;
  types: ExpenseType[]; // empty = all
};

export function useExpenses(filters: ExpenseFilters) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['expenses', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('expenses')
        .select(
          'id, type, category, description, amount_paisa, expense_date, include_in_pnl, receipt_url, created_at',
        )
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('expense_date', filters.from)
        .lte('expense_date', filters.to)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.types.length > 0) q = q.in('type', filters.types);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        amount_paisa: Number(r.amount_paisa),
      })) as ExpenseRow[];
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  return useMutation({
    mutationFn: (id: string) => softDeleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', activeId] });
    },
  });
}
