'use client';

import { useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { useStockReport } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportStockPdf, exportStockExcel } from '@/lib/actions/reports';
import { ExportButtons, KPICard } from './shared';
import type { Role } from '@/lib/auth/permissions';

type Props = { role: Role };

export function StockReport({ role }: Props) {
  const { data: rows = [], isLoading } = useStockReport();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const canSeeCost = role === 'admin' || role === 'accountant';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !q || r.product_name.toLowerCase().includes(q) || (r.sku ?? '').toLowerCase().includes(q))
      .filter((r) => !lowOnly || r.is_low);
  }, [rows, search, lowOnly]);

  const totalUnits = useMemo(() => filtered.reduce((s, r) => s + r.quantity_on_hand, 0), [filtered]);
  const totalValue = useMemo(() => filtered.reduce((s, r) => s + r.value_at_cost_paisa, 0), [filtered]);
  const lowCount = useMemo(() => filtered.filter((r) => r.is_low).length, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Product or SKU…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setLowOnly((v) => !v)}
          className={[
            'inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-medium',
            lowOnly ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
          ].join(' ')}
        >
          <AlertTriangle size={14} /> Low stock only
        </button>
        <ExportButtons onExportPdf={exportStockPdf} onExportExcel={exportStockExcel} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KPICard label="Products" value={String(filtered.length)} />
            <KPICard label="Total Units" value={String(totalUnits)} />
            {canSeeCost && <KPICard label="Value at Cost" value={formatPKR(totalValue)} sub={`${lowCount} low stock`} />}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">SKU</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">On Hand</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Threshold</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Sale Price</th>
                  {canSeeCost && <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>}
                  {canSeeCost && <th className="text-right px-4 py-3 font-medium text-gray-600">Value at Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && <tr><td colSpan={canSeeCost ? 8 : 6} className="text-center py-6 text-gray-400">No products match.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.product_id} className={r.is_low ? 'bg-amber-50/40' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {r.product_name}
                      {r.is_low && <AlertTriangle size={11} className="inline ml-1.5 text-amber-600" />}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{r.sku ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.unit}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.is_low ? 'font-medium text-amber-700' : ''}`}>{r.quantity_on_hand}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-mono text-gray-400">{r.low_stock_threshold ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(r.sale_price_paisa)}</td>
                    {canSeeCost && (
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                        {r.purchase_price_paisa != null ? formatPKR(r.purchase_price_paisa) : '—'}
                      </td>
                    )}
                    {canSeeCost && (
                      <td className="px-4 py-2.5 text-right font-mono font-medium">{formatPKR(r.value_at_cost_paisa)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
