'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { usePurchaseData } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportPurchasePdf, exportPurchaseExcel } from '@/lib/actions/reports';
import {
  FilterBar, KPICard, ExportButtons, rangeForPreset,
  type DatePreset, type DateRange,
} from './shared';

export function PurchaseReport() {
  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));
  const { data: rows = [], isLoading } = usePurchaseData(range);

  const total = useMemo(() => rows.reduce((s, r) => s + r.total_value_paisa, 0), [rows]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { quantity: number; value_paisa: number; unit: string }>();
    for (const r of rows) {
      const v = m.get(r.product_name) ?? { quantity: 0, value_paisa: 0, unit: r.unit };
      v.quantity += r.quantity;
      v.value_paisa += r.total_value_paisa;
      m.set(r.product_name, v);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value_paisa - a.value_paisa);
  }, [rows]);

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset} range={range} onPresetChange={setPreset} onRangeChange={setRange}
        extras={<div className="flex justify-end"><ExportButtons onExportPdf={() => exportPurchasePdf(range)} onExportExcel={() => exportPurchaseExcel(range)} /></div>}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KPICard label="Total Value" value={formatPKR(total)} />
            <KPICard label="Movements" value={String(rows.length)} sub={`${byProduct.length} unique products`} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">By Product</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Product</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Quantity</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {byProduct.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-gray-400">No purchases in this period.</td></tr>}
                {byProduct.map((p) => (
                  <tr key={p.name}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{p.quantity} {p.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(p.value_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">Movements</h3>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Product</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Qty</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Value</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 tabular-nums">{format(parseISO(r.movement_date), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2.5 text-gray-900">{r.product_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.quantity} {r.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(r.purchase_price_paisa)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium">{formatPKR(r.total_value_paisa)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.note ?? '—'}</td>
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
