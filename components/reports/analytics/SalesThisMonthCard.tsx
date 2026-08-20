'use client';

import Link from 'next/link';
import { ArrowRight, PieChart } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { useSalesOverview } from '@/lib/queries/sales-analytics';
import { percentChange } from '@/lib/sales-analytics';
import { rangeForPreset } from '@/components/reports/shared';

/**
 * Dashboard entry point. Reuses the analytics overview query rather than a
 * separate count, so this figure and the analytics page always agree.
 */
export function SalesThisMonthCard() {
  const range = rangeForPreset('month');
  const { data, isLoading, error } = useSalesOverview(range);

  // The views refuse cost, not sales, so an error here means the read failed
  // outright — the dashboard is better off without a broken card on it.
  if (error) return null;

  const change =
    data?.previous ? percentChange(data.current.salesPaisa, data.previous.salesPaisa) : null;

  return (
    <Link
      href="/reports/sales-analytics"
      className="block rounded-2xl border border-gray-200 bg-white px-4 py-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium flex items-center gap-1.5">
            <PieChart size={12} /> Sales This Month
          </p>
          {isLoading ? (
            <div className="h-6 w-32 bg-gray-100 rounded mt-1.5 animate-pulse" />
          ) : (
            <p className="text-xl font-mono font-semibold mt-1 tabular-nums text-gray-900">
              {formatPKR(data?.current.salesPaisa ?? 0)}
            </p>
          )}
          {change !== null && (
            <p className={`text-xs mt-0.5 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(1)}% vs the previous {monthLengthLabel(range)}
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 shrink-0">
          View Analytics <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}

/**
 * "This month" is month-to-date, so the comparison span is the same number of
 * days before it — not the whole of last month. Saying so avoids a figure that
 * looks like a monthly comparison but is not one.
 */
function monthLengthLabel(range: { from: string; to: string }): string {
  const days =
    Math.round(
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000,
    ) + 1;
  return `${days} days`;
}
