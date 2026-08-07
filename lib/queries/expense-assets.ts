'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useBusinessStore } from '@/lib/store/business';
import { expenseCategoryGroup } from '@/lib/validators/expense-assets';
import type { ExpenseType } from '@/lib/validators/expense';

export type ExpenseAsset = {
  id: string;
  category: string;
  name: string;
  asset_type: string | null;
  details: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export type ExpenseSubType = {
  id: string;
  category: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

/**
 * A row of expense_asset_summary_view: one (type, category, asset, sub-type,
 * month) bucket. asset_id NULL = untracked expenses.
 */
export type ExpenseSummaryRow = {
  type: ExpenseType;
  category: string;
  asset_id: string | null;
  asset_name: string | null;
  asset_type: string | null;
  sub_type_id: string | null;
  sub_type_name: string | null;
  expense_month: string;
  transaction_count: number;
  total_paisa: number;
};

function mapSummaryRow(r: Record<string, unknown>): ExpenseSummaryRow {
  return {
    type: r.type as ExpenseType,
    category: r.category as string,
    asset_id: (r.asset_id as string | null) ?? null,
    asset_name: (r.asset_name as string | null) ?? null,
    asset_type: (r.asset_type as string | null) ?? null,
    sub_type_id: (r.sub_type_id as string | null) ?? null,
    sub_type_name: (r.sub_type_name as string | null) ?? null,
    expense_month: r.expense_month as string,
    transaction_count: Number(r.transaction_count ?? 0),
    total_paisa: Number(r.total_paisa ?? 0),
  };
}

/**
 * ALL active assets, one fetch — the expense form prefetches this on mount
 * and filters client-side when the category changes, so progressive fields
 * appear with zero loading state. Pass a category to filter (honouring the
 * Transport↔Maintenance group).
 */
export function useExpenseAssets(category?: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  const query = useQuery({
    queryKey: ['expense-assets', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('expense_assets')
        .select('id, category, name, asset_type, details, is_active, created_at')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ExpenseAsset[];
    },
  });

  const all = query.data ?? [];
  const assets = category
    ? all.filter((a) => expenseCategoryGroup(category).includes(a.category))
    : all;

  return { ...query, assets };
}

/** Same prefetch-once pattern for sub-types. */
export function useExpenseSubTypes(category?: string) {
  const activeId = useBusinessStore((s) => s.activeId);

  const query = useQuery({
    queryKey: ['expense-sub-types', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('expense_sub_types')
        .select('id, category, name, sort_order, is_active')
        .eq('business_id', activeId!)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []) as ExpenseSubType[];
    },
  });

  const all = query.data ?? [];
  const subTypes = category
    ? all.filter((s) => expenseCategoryGroup(category).includes(s.category))
    : all;

  return { ...query, subTypes };
}

export type SummaryFilters = {
  /** ISO dates; omit for all-time. */
  from?: string;
  to?: string;
  category?: string;
  assetId?: string | 'untracked';
  type?: ExpenseType;
};

/**
 * Flexible report feed straight off expense_asset_summary_view.
 * Month bucketing means `from`/`to` snap to whole months — callers pass
 * month starts (the report UI only offers month-grained presets).
 */
export function useExpenseSummary(filters: SummaryFilters) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['expense-summary', activeId, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('expense_asset_summary_view')
        .select('*')
        .eq('business_id', activeId!);

      if (filters.from) q = q.gte('expense_month', filters.from);
      if (filters.to) q = q.lte('expense_month', filters.to);
      if (filters.category) q = q.in('category', expenseCategoryGroup(filters.category));
      if (filters.assetId === 'untracked') q = q.is('asset_id', null);
      else if (filters.assetId) q = q.eq('asset_id', filters.assetId);
      if (filters.type) q = q.eq('type', filters.type);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapSummaryRow);
    },
  });
}

/** Total + sub-type breakdown for one asset. */
export function useAssetExpenseSummary(
  assetId: string,
  dateRange?: { from: string; to: string },
) {
  const summary = useExpenseSummary({ assetId, ...dateRange });
  const rows = summary.data ?? [];

  const totalPaisa = rows.reduce((s, r) => s + r.total_paisa, 0);
  const bySubType = new Map<string, number>();
  for (const r of rows) {
    const key = r.sub_type_name ?? 'Other';
    bySubType.set(key, (bySubType.get(key) ?? 0) + r.total_paisa);
  }

  return {
    ...summary,
    totalPaisa,
    bySubType: Array.from(bySubType.entries())
      .map(([name, paisa]) => ({ name, paisa }))
      .sort((a, b) => b.paisa - a.paisa),
  };
}

/** All assets in one category (group-aware) with their totals. */
export function useCategoryExpenseSummary(
  category: string,
  dateRange?: { from: string; to: string },
) {
  const summary = useExpenseSummary({ category, ...dateRange });
  const rows = summary.data ?? [];

  const byAsset = new Map<string, { assetId: string | null; name: string; paisa: number }>();
  for (const r of rows) {
    const key = r.asset_id ?? 'untracked';
    const cur = byAsset.get(key) ?? {
      assetId: r.asset_id,
      name: r.asset_name ?? 'Untracked',
      paisa: 0,
    };
    cur.paisa += r.total_paisa;
    byAsset.set(key, cur);
  }

  return {
    ...summary,
    assets: Array.from(byAsset.values()).sort((a, b) => b.paisa - a.paisa),
  };
}

export function useInvalidateExpenseAssetData() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return () => {
    for (const key of ['expense-assets', 'expense-sub-types', 'expense-summary', 'expenses']) {
      queryClient.invalidateQueries({ queryKey: [key, activeId] });
    }
  };
}
