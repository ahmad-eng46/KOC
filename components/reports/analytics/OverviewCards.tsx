'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { percentChange, type SalesSummary } from '@/lib/sales-analytics';

type Props = {
  current: SalesSummary;
  previous: SalesSummary | null;
  /** What the comparison is against, e.g. "previous 30 days". */
  comparisonLabel: string;
  showProfit: boolean;
};

export function OverviewCards({ current, previous, comparisonLabel, showProfit }: Props) {
  const cards = [
    { label: 'Total Sales', value: formatPKR(current.salesPaisa), now: current.salesPaisa, before: previous?.salesPaisa },
    { label: 'Invoices', value: String(current.invoiceCount), now: current.invoiceCount, before: previous?.invoiceCount },
    { label: 'Qty Sold', value: formatQty(current.quantity), now: current.quantity, before: previous?.quantity },
    { label: 'Avg Invoice', value: formatPKR(current.averageInvoicePaisa), now: current.averageInvoicePaisa, before: previous?.averageInvoicePaisa },
  ];

  if (showProfit && current.profitPaisa !== null) {
    cards.push({
      label: 'Profit',
      value: formatPKR(current.profitPaisa),
      now: current.profitPaisa,
      before: previous?.profitPaisa ?? undefined,
    });
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} {...c} comparisonLabel={comparisonLabel} />
      ))}
    </div>
  );
}

function Card({
  label, value, now, before, comparisonLabel,
}: {
  label: string;
  value: string;
  now: number;
  before?: number;
  comparisonLabel: string;
}) {
  const change = before === undefined ? null : percentChange(now, before);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className="text-xl font-mono font-semibold mt-1 tabular-nums text-gray-900 break-all">{value}</p>
      <Delta change={change} hadBaseline={before !== undefined && before !== 0} comparisonLabel={comparisonLabel} />
    </div>
  );
}

function Delta({
  change, hadBaseline, comparisonLabel,
}: {
  change: number | null;
  hadBaseline: boolean;
  comparisonLabel: string;
}) {
  // No baseline means no honest percentage. Saying so beats printing a green
  // arrow that only means "there was nothing before".
  if (change === null) {
    return (
      <p className="text-xs text-gray-400 mt-1">
        {hadBaseline ? '—' : `No sales in the ${comparisonLabel}`}
      </p>
    );
  }

  const rising = change > 0.5;
  const falling = change < -0.5;
  const Icon = rising ? TrendingUp : falling ? TrendingDown : Minus;
  const tone = rising ? 'text-green-600' : falling ? 'text-red-600' : 'text-gray-400';

  return (
    <p className={`text-xs mt-1 flex items-center gap-1 ${tone}`}>
      <Icon size={12} className="shrink-0" />
      <span className="tabular-nums">{Math.abs(change).toFixed(1)}%</span>
      <span className="text-gray-400 truncate">vs {comparisonLabel}</span>
    </p>
  );
}

/** Quantities are counts of things, not money — trim the noise, keep the fraction. */
export function formatQty(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-PK') : n.toFixed(2);
}
