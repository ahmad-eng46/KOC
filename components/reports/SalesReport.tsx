'use client';

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { useSalesData } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportSalesPdf, exportSalesExcel } from '@/lib/actions/reports';
import {
  FilterBar, KPICard, ExportButtons, rangeForPreset,
  type DatePreset, type DateRange,
} from './shared';

export function SalesReport() {
  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));
  const { data: rows = [], isLoading } = useSalesData(range);

  const total = useMemo(() => rows.reduce((s, r) => s + r.total_paisa, 0), [rows]);
  const paid = useMemo(() => rows.reduce((s, r) => s + r.paid_paisa, 0), [rows]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.issue_date, (m.get(r.issue_date) ?? 0) + r.total_paisa);
    return Array.from(m.entries())
      .map(([date, total_paisa]) => ({ date, total: total_paisa / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const topCustomers = useMemo(() => {
    const m = new Map<string, { total_paisa: number; count: number }>();
    for (const r of rows) {
      const v = m.get(r.customer_name) ?? { total_paisa: 0, count: 0 };
      v.total_paisa += r.total_paisa;
      v.count += 1;
      m.set(r.customer_name, v);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total_paisa - a.total_paisa)
      .slice(0, 10);
  }, [rows]);

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset}
        range={range}
        onPresetChange={setPreset}
        onRangeChange={setRange}
        extras={<div className="flex justify-end"><ExportButtons onExportPdf={() => exportSalesPdf(range)} onExportExcel={() => exportSalesExcel(range)} /></div>}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KPICard label="Total Sales" value={formatPKR(total)} />
            <KPICard label="Total Paid" value={formatPKR(paid)} accent="text-green-700" />
            <KPICard label="Outstanding" value={formatPKR(total - paid)} accent={total - paid > 0 ? 'text-red-600' : 'text-gray-700'} sub={`${rows.length} invoice${rows.length === 1 ? '' : 's'}`} />
          </div>

          {byDay.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Sales by Day</h3>
              <div style={{ width: '100%', height: 240 }}>
                <ResponsiveContainer>
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'dd MMM')} fontSize={11} />
                    <YAxis tickFormatter={(n) => `${(n / 1000).toFixed(0)}k`} fontSize={11} />
                    <Tooltip formatter={(v) => formatPKR(Math.round(Number(v) * 100))} labelFormatter={(d) => format(parseISO(d as string), 'dd MMM yyyy')} />
                    <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-900 p-4 border-b border-gray-200">Top 10 Customers</h3>
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Customer</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Invoices</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topCustomers.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-gray-400">No sales in this period.</td></tr>
                )}
                {topCustomers.map((c) => (
                  <tr key={c.name}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(c.total_paisa)}</td>
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
