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
  asset_id: string | null;
  asset_name: string | null;
  sub_type_id: string | null;
  sub_type_name: string | null;
};

export type ExpenseFilters = {
  from: string;
  to: string;
  types: ExpenseType[]; // empty = all
  category?: string;
  /** 'untracked' = rows with no asset. */
  assetId?: string | 'untracked';
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
          'id, type, category, description, amount_paisa, expense_date, include_in_pnl, receipt_url, created_at, asset_id, asset_name, sub_type_id, sub_type_name',
        )
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .gte('expense_date', filters.from)
        .lte('expense_date', filters.to)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.types.length > 0) q = q.in('type', filters.types);
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.assetId === 'untracked') q = q.is('asset_id', null);
      else if (filters.assetId) q = q.eq('asset_id', filters.assetId);

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
