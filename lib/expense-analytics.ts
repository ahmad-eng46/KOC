import { format, startOfMonth, subMonths } from 'date-fns';
import type { Money } from '@/lib/money';
import type { ExpenseSummaryRow } from '@/lib/queries/expense-assets';

/**
 * Pure aggregation over expense_asset_summary_view rows for the analytics
 * page. Everything stays in integer paisa; `now` is a parameter so every
 * boundary is unit-testable.
 */

export type PeriodKey = 'thisMonth' | 'lastMonth' | 'threeMonths' | 'sixMonths' | 'year' | 'total';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  threeMonths: '3 Months',
  sixMonths: '6 Months',
  year: 'This Year',
  total: 'Total',
};

function monthKey(d: Date): string {
  return format(startOfMonth(d), 'yyyy-MM-dd');
}

/** First day of the month `n` months before now, as the view's month key. */
export function monthKeyAgo(now: Date, n: number): string {
  return monthKey(subMonths(now, n));
}

/** Inclusive month-key window for each table period. */
function periodWindow(now: Date, period: PeriodKey): { from?: string; to?: string } {
  switch (period) {
    case 'thisMonth':   return { from: monthKeyAgo(now, 0) };
    case 'lastMonth':   return { from: monthKeyAgo(now, 1), to: monthKeyAgo(now, 1) };
    case 'threeMonths': return { from: monthKeyAgo(now, 2) };  // current + 2 back
    case 'sixMonths':   return { from: monthKeyAgo(now, 5) };
    case 'year':        return { from: format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd') };
    case 'total':       return {};
  }
}

function inWindow(month: string, w: { from?: string; to?: string }): boolean {
  if (w.from && month < w.from) return false;
  if (w.to && month > w.to) return false;
  return true;
}

export type AssetBreakdownRow = {
  key: string; // asset_id or 'untracked'
  assetName: string;
  category: string; // 'Various' for untracked spanning categories
  periods: Record<PeriodKey, Money>;
};

/**
 * The middle-section table: one row per asset plus an Untracked bucket,
 * every period column computed from the same month buckets.
 */
export function buildAssetBreakdown(rows: ExpenseSummaryRow[], now: Date): AssetBreakdownRow[] {
  const windows = Object.fromEntries(
    (Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => [p, periodWindow(now, p)]),
  ) as Record<PeriodKey, { from?: string; to?: string }>;

  const byAsset = new Map<string, AssetBreakdownRow & { categories: Set<string> }>();
  for (const r of rows) {
    const key = r.asset_id ?? 'untracked';
    const cur =
      byAsset.get(key) ??
      ({
        key,
        assetName: r.asset_name ?? 'Untracked',
        category: r.category,
        categories: new Set<string>(),
        periods: {
          thisMonth: 0, lastMonth: 0, threeMonths: 0, sixMonths: 0, year: 0, total: 0,
        },
      } as AssetBreakdownRow & { categories: Set<string> });

    cur.categories.add(r.category);
    for (const p of Object.keys(windows) as PeriodKey[]) {
      if (inWindow(r.expense_month, windows[p])) cur.periods[p] += r.total_paisa;
    }
    byAsset.set(key, cur);
  }

  return Array.from(byAsset.values())
    .map((r) => ({
      key: r.key,
      assetName: r.assetName,
      // A vehicle spans Transport+Maintenance; untracked can span anything.
      category:
        r.key === 'untracked' && r.categories.size > 1 ? 'Various'
          : r.categories.size > 1 ? Array.from(r.categories).sort().join(' / ')
            : Array.from(r.categories)[0] ?? '—',
      periods: r.periods,
    }))
    .sort((a, b) => b.periods.total - a.periods.total || a.assetName.localeCompare(b.assetName));
}

export type SubTypeShare = {
  name: string;
  paisa: Money;
  /** Integer percent of the asset's total; shares sum to ≤ 100. */
  pct: number;
};

/** Sub-type split for one asset (expanded table row / donut). */
export function buildSubTypeShares(
  rows: ExpenseSummaryRow[],
  assetKey: string,
  now: Date,
  period: PeriodKey = 'total',
): SubTypeShare[] {
  const w = periodWindow(now, period);
  const byName = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if ((r.asset_id ?? 'untracked') !== assetKey) continue;
    if (!inWindow(r.expense_month, w)) continue;
    const name = r.sub_type_name ?? 'Other';
    byName.set(name, (byName.get(name) ?? 0) + r.total_paisa);
    total += r.total_paisa;
  }
  return Array.from(byName.entries())
    .map(([name, paisa]) => ({
      name,
      paisa,
      pct: total > 0 ? Math.round((paisa / total) * 100) : 0,
    }))
    .sort((a, b) => b.paisa - a.paisa);
}

/** Cap a share list for a donut: top N kept, tail folded into "Other". */
export function capShares(shares: SubTypeShare[], max: number): SubTypeShare[] {
  if (shares.length <= max) return shares;
  const kept = shares.slice(0, max - 1);
  const tail = shares.slice(max - 1);
  const tailPaisa = tail.reduce((s, r) => s + r.paisa, 0);
  const tailPct = tail.reduce((s, r) => s + r.pct, 0);
  return [...kept, { name: 'Other', paisa: tailPaisa, pct: tailPct }];
}

export type MonthPoint = { month: string; label: string; paisa: Money };

/** Last `n` calendar months (oldest first), zero-filled for empty months. */
export function buildMonthlyTrend(
  rows: ExpenseSummaryRow[],
  now: Date,
  n = 12,
  assetKey?: string,
): MonthPoint[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    if (assetKey !== undefined && (r.asset_id ?? 'untracked') !== assetKey) continue;
    byMonth.set(r.expense_month, (byMonth.get(r.expense_month) ?? 0) + r.total_paisa);
  }
  const points: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = monthKeyAgo(now, i);
    points.push({
      month: key,
      label: format(subMonths(startOfMonth(now), i), 'MMM yy'),
      paisa: byMonth.get(key) ?? 0,
    });
  }
  return points;
}

export type HeadlineStats = {
  totalPaisa: Money;
  topCategory: { name: string; paisa: Money } | null;
  topAsset: { name: string; paisa: Money } | null;
  /** Percent change vs the equally-long previous window; null when previous = 0. */
  vsPreviousPct: number | null;
  previousPaisa: Money;
};

/**
 * Top cards. `monthsBack` is the size of the current window in whole months
 * (1 = this month); the comparison window is the `monthsBack` months
 * immediately before it.
 */
export function buildHeadline(
  rows: ExpenseSummaryRow[],
  now: Date,
  monthsBack: number,
): HeadlineStats {
  const curFrom = monthKeyAgo(now, monthsBack - 1);
  const prevFrom = monthKeyAgo(now, monthsBack * 2 - 1);
  const prevTo = monthKeyAgo(now, monthsBack);

  let totalPaisa = 0;
  let previousPaisa = 0;
  const byCategory = new Map<string, number>();
  const byAsset = new Map<string, { name: string; paisa: number }>();

  for (const r of rows) {
    if (r.expense_month >= curFrom) {
      totalPaisa += r.total_paisa;
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + r.total_paisa);
      if (r.asset_id) {
        const cur = byAsset.get(r.asset_id) ?? { name: r.asset_name ?? '—', paisa: 0 };
        cur.paisa += r.total_paisa;
        byAsset.set(r.asset_id, cur);
      }
    } else if (r.expense_month >= prevFrom && r.expense_month <= prevTo) {
      previousPaisa += r.total_paisa;
    }
  }

  const topCategory =
    Array.from(byCategory.entries())
      .map(([name, paisa]) => ({ name, paisa }))
      .sort((a, b) => b.paisa - a.paisa)[0] ?? null;
  const topAsset =
    Array.from(byAsset.values()).sort((a, b) => b.paisa - a.paisa)[0] ?? null;

  return {
    totalPaisa,
    topCategory,
    topAsset,
    previousPaisa,
    vsPreviousPct:
      previousPaisa > 0
        ? Math.round(((totalPaisa - previousPaisa) / previousPaisa) * 100)
        : null,
  };
}
