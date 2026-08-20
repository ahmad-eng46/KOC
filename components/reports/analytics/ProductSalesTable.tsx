'use client';

import { useMemo, useState } from 'react';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { productTrend, type ProductPeriodRow, type Trend } from '@/lib/sales-analytics';
import { formatQty } from './OverviewCards';

const COLUMNS = [
  { key: 'd7',  label: '7 Days',   qty: (p: ProductPeriodRow) => p.qty_7d,   amount: (p: ProductPeriodRow) => p.sales_7d_paisa },
  { key: 'd15', label: '15 Days',  qty: (p: ProductPeriodRow) => p.qty_15d,  amount: (p: ProductPeriodRow) => p.sales_15d_paisa },
  { key: 'd30', label: '30 Days',  qty: (p: ProductPeriodRow) => p.qty_30d,  amount: (p: ProductPeriodRow) => p.sales_30d_paisa },
  { key: 'd90', label: '90 Days',  qty: (p: ProductPeriodRow) => p.qty_90d,  amount: (p: ProductPeriodRow) => p.sales_90d_paisa },
  { key: 'd365', label: '1 Year',  qty: (p: ProductPeriodRow) => p.qty_365d, amount: (p: ProductPeriodRow) => p.sales_365d_paisa },
  { key: 'all', label: 'All Time', qty: (p: ProductPeriodRow) => p.qty_all,  amount: (p: ProductPeriodRow) => p.sales_all_paisa },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

export type ProductTableFilters = {
  brandId: string | null;
  locationId: string | null;
  status: 'active' | 'all';
};

type Props = {
  rows: ProductPeriodRow[];
  filters: ProductTableFilters;
  onFiltersChange: (f: ProductTableFilters) => void;
  brands: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  onSelectProduct: (row: ProductPeriodRow) => void;
  /** Location filtering happens upstream on the line view, so it is disabled here. */
  locationFilterDisabled?: boolean;
};

export function ProductSalesTable({
  rows, filters, onFiltersChange, brands, locations, onSelectProduct, locationFilterDisabled,
}: Props) {
  const [sortBy, setSortBy] = useState<ColumnKey>('d30');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const column = COLUMNS.find((c) => c.key === sortBy)!;

    const matched = (rows ?? []).filter(
      (r) => !q || r.product_name.toLowerCase().includes(q) || (r.product_sku ?? '').toLowerCase().includes(q),
    );

    // Products that have never sold anything sink to the bottom whatever the
    // sort, so a column of zeros never pushes the real answer off the screen.
    const sold = matched.filter((r) => r.qty_all > 0);
    const unsold = matched.filter((r) => r.qty_all === 0);

    sold.sort((a, b) => column.amount(b) - column.amount(a));
    unsold.sort((a, b) => a.product_name.localeCompare(b.product_name));

    return [...sold, ...unsold];
  }, [rows, search, sortBy]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product name or SKU…"
            className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Select
          label="Brand"
          value={filters.brandId ?? ''}
          onChange={(v) => onFiltersChange({ ...filters, brandId: v || null })}
          options={[{ value: '', label: 'All brands' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
        />

        <Select
          label="Location"
          value={filters.locationId ?? ''}
          disabled={locationFilterDisabled}
          onChange={(v) => onFiltersChange({ ...filters, locationId: v || null })}
          options={[{ value: '', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
        />

        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => onFiltersChange({ ...filters, status: v as 'active' | 'all' })}
          options={[{ value: 'active', label: 'Active only' }, { value: 'all', label: 'Include inactive' }]}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* Sticky so the product stays readable while the periods scroll on a phone. */}
                <th className="text-left px-4 py-3 font-medium text-gray-600 sticky left-0 bg-gray-50 z-10">
                  Product
                </th>
                <th className="text-left px-3 py-3 font-medium text-gray-600">Brand</th>
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
                <th className="text-center px-3 py-3 font-medium text-gray-600">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 3} className="text-center py-10 text-gray-400 text-sm">
                    No products match.
                  </td>
                </tr>
              )}
              {visible.map((r) => {
                const neverSold = r.qty_all === 0;
                return (
                  <tr key={r.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 sticky left-0 bg-white z-10">
                      <button
                        onClick={() => onSelectProduct(r)}
                        className="text-left min-h-11 hover:text-blue-700"
                      >
                        <span className="font-medium text-gray-900 block">{r.product_name}</span>
                        {r.product_sku && <span className="text-xs text-gray-400">{r.product_sku}</span>}
                        {neverSold && (
                          <span className="block text-xs text-red-600 font-medium mt-0.5">No sales</span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{r.brand_name ?? '—'}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-3 text-right">
                        <span className="block font-mono text-sm tabular-nums text-gray-900">
                          {formatQty(c.qty(r))}
                        </span>
                        <span className="block text-xs text-gray-500 tabular-nums">
                          {formatPKR(c.amount(r))}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center">
                      <TrendMark trend={productTrend(r)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        {visible.length} product{visible.length === 1 ? '' : 's'} · quantity above, value below ·
        trend compares the last 30 days with the 30 before them
      </p>
    </div>
  );
}

export function TrendMark({ trend }: { trend: Trend }) {
  if (trend === 'up') return <TrendingUp size={16} className="text-green-600 inline" aria-label="Rising" />;
  if (trend === 'down') return <TrendingDown size={16} className="text-red-600 inline" aria-label="Falling" />;
  return <Minus size={16} className="text-gray-300 inline" aria-label="Flat" />;
}

function Select({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
      {label}:
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 sm:h-10 px-2 rounded-xl border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
