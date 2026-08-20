'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import type { ProductPeriodRow } from '@/lib/sales-analytics';
import { formatQty } from './OverviewCards';

/**
 * Brand totals are summed from the per-product rollup rather than read from a
 * second query, so a brand row is always exactly its products added up. The
 * windows are the rollup's own, which is why this table ignores the page's date
 * range — a fixed-window comparison is the point of it.
 */
const COLUMNS = [
  { key: 'd7',  label: '7 Days',  qty: (p: ProductPeriodRow) => p.qty_7d,  amount: (p: ProductPeriodRow) => p.sales_7d_paisa },
  { key: 'd15', label: '15 Days', qty: (p: ProductPeriodRow) => p.qty_15d, amount: (p: ProductPeriodRow) => p.sales_15d_paisa },
  { key: 'd30', label: '30 Days', qty: (p: ProductPeriodRow) => p.qty_30d, amount: (p: ProductPeriodRow) => p.sales_30d_paisa },
  { key: 'd90', label: '90 Days', qty: (p: ProductPeriodRow) => p.qty_90d, amount: (p: ProductPeriodRow) => p.sales_90d_paisa },
  { key: 'all', label: 'All Time', qty: (p: ProductPeriodRow) => p.qty_all, amount: (p: ProductPeriodRow) => p.sales_all_paisa },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

type BrandGroup = {
  brandId: string;
  brandName: string;
  products: ProductPeriodRow[];
  totals: Record<ColumnKey, { qty: number; amount: number }>;
};

export function BrandPerformance({
  rows,
  onSelectBrand,
}: {
  rows: ProductPeriodRow[];
  onSelectBrand?: (brandId: string | null) => void;
}) {
  const [sortBy, setSortBy] = useState<ColumnKey>('d30');
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => buildGroups(rows, sortBy), [rows, sortBy]);

  if (groups.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No sales to break down yet.</p>;
  }

  // Whoever leads each column gets marked, so the eye finds the winner per window.
  const leaders = new Map<ColumnKey, string>();
  for (const c of COLUMNS) {
    const best = [...groups].sort((a, b) => b.totals[c.key].amount - a.totals[c.key].amount)[0];
    if (best && best.totals[c.key].amount > 0) leaders.set(c.key, best.brandId);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Brand</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="text-right px-3 py-3 font-medium">
                  <button
                    onClick={() => setSortBy(c.key)}
                    className={[
                      'inline-flex items-center gap-1 hover:text-blue-700',
                      sortBy === c.key ? 'text-blue-700 font-semibold' : 'text-gray-600',
                    ].join(' ')}
                  >
                    {c.label}
                    {sortBy === c.key && <span aria-hidden>↓</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {groups.map((g) => (
              <BrandRows
                key={g.brandId}
                group={g}
                leaders={leaders}
                open={expanded === g.brandId}
                onToggle={() => setExpanded(expanded === g.brandId ? null : g.brandId)}
                onSelect={onSelectBrand}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrandRows({
  group, leaders, open, onToggle, onSelect,
}: {
  group: BrandGroup;
  leaders: Map<ColumnKey, string>;
  open: boolean;
  onToggle: () => void;
  onSelect?: (brandId: string | null) => void;
}) {
  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3">
          <button onClick={onToggle} className="flex items-start gap-1.5 text-left min-h-11">
            {open ? <ChevronDown size={15} className="mt-0.5 text-gray-400 shrink-0" />
                  : <ChevronRight size={15} className="mt-0.5 text-gray-400 shrink-0" />}
            <span>
              <span className="font-medium text-gray-900">{group.brandName}</span>
              <span className="block text-xs text-gray-500">
                {group.products.length} product{group.products.length === 1 ? '' : 's'}
              </span>
            </span>
          </button>
        </td>
        {COLUMNS.map((c) => {
          const cell = group.totals[c.key];
          const isLeader = leaders.get(c.key) === group.brandId;
          return (
            <td key={c.key} className="px-3 py-3 text-right">
              <span className={[
                'block font-mono font-semibold tabular-nums',
                isLeader ? 'text-blue-700' : 'text-gray-900',
              ].join(' ')}>
                {formatPKR(cell.amount)}
              </span>
              <span className="block text-xs text-gray-500 tabular-nums">{formatQty(cell.qty)} units</span>
            </td>
          );
        })}
      </tr>

      {open && group.products.map((p) => (
        <tr key={p.product_id} className="bg-gray-50/60">
          <td className="pl-10 pr-4 py-2">
            <button
              onClick={() => onSelect?.(group.brandId === '' ? null : group.brandId)}
              className="text-left text-sm text-gray-700 hover:text-blue-700"
            >
              {p.product_name}
              {p.product_sku && <span className="block text-xs text-gray-400">{p.product_sku}</span>}
            </button>
          </td>
          {COLUMNS.map((c) => (
            <td key={c.key} className="px-3 py-2 text-right">
              <span className="block font-mono text-xs tabular-nums text-gray-700">{formatPKR(c.amount(p))}</span>
              <span className="block text-xs text-gray-400 tabular-nums">{formatQty(c.qty(p))}</span>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function buildGroups(rows: ProductPeriodRow[], sortBy: ColumnKey): BrandGroup[] {
  const map = new Map<string, BrandGroup>();

  for (const r of rows) {
    const id = r.brand_id ?? '';
    let g = map.get(id);
    if (!g) {
      g = {
        brandId: id,
        brandName: r.brand_name ?? 'Unbranded',
        products: [],
        totals: Object.fromEntries(COLUMNS.map((c) => [c.key, { qty: 0, amount: 0 }])) as BrandGroup['totals'],
      };
      map.set(id, g);
    }
    g.products.push(r);
    for (const c of COLUMNS) {
      g.totals[c.key].qty += c.qty(r);
      g.totals[c.key].amount += c.amount(r);
    }
  }

  for (const g of map.values()) {
    g.products.sort((a, b) => b.sales_30d_paisa - a.sales_30d_paisa);
  }

  return [...map.values()]
    .filter((g) => g.totals.all.amount > 0 || g.products.length > 0)
    .sort((a, b) => b.totals[sortBy].amount - a.totals[sortBy].amount);
}
