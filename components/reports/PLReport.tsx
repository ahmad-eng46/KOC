'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { usePLReport } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportPLPdf, exportPLExcel } from '@/lib/actions/reports';
import {
  FilterBar, KPICard, ExportButtons, rangeForPreset,
  type DatePreset, type DateRange,
} from './shared';

export function PLReport() {
  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));
  const { data, isLoading } = usePLReport(range);

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset} range={range} onPresetChange={setPreset} onRangeChange={setRange}
        extras={<div className="flex justify-end"><ExportButtons onExportPdf={() => exportPLPdf(range)} onExportExcel={() => exportPLExcel(range)} /></div>}
      />

      {isLoading || !data ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard label="Net Sales" value={formatPKR(data.net_sales_paisa)} sub={`Sales ${formatPKR(data.sales_paisa)} − Returns ${formatPKR(data.returns_paisa)}`} />
            <KPICard label="Gross Profit" value={formatPKR(data.gross_profit_paisa)} accent={data.gross_profit_paisa >= 0 ? 'text-green-700' : 'text-red-600'} sub={`COGS ${formatPKR(data.net_cogs_paisa)}`} />
            <KPICard label="Total Expenses" value={formatPKR(data.total_exp_paisa)} sub={data.include_home_in_pnl ? 'incl. home' : 'excl. home'} />
            <KPICard label="Net Profit" value={formatPKR(data.net_profit_paisa)} accent={data.net_profit_paisa >= 0 ? 'text-green-700' : 'text-red-600'} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                <SectionHeader>Revenue</SectionHeader>
                <Row label="Sales" value={data.sales_paisa} />
                <Row label="Less: Returns" value={-data.returns_paisa} />
                <Row label="Net Sales" value={data.net_sales_paisa} bold />

                <SectionHeader>Cost of Goods Sold</SectionHeader>
                <Row label="COGS (sold)" value={data.cogs_paisa} />
                <Row label="Less: COGS reversed by returns" value={-data.cogs_returns_paisa} />
                <Row label="Net COGS" value={data.net_cogs_paisa} bold />

                <Row label="Gross Profit" value={data.gross_profit_paisa} bold highlight />

                <SectionHeader>Expenses</SectionHeader>
                <Row label="Operating Expenses (business)" value={data.opex_paisa} />
                <Row
                  label={`Home Expenses ${data.include_home_in_pnl ? '(included)' : '(excluded by setting)'}`}
                  value={data.include_home_in_pnl ? data.home_exp_paisa : 0}
                  muted={!data.include_home_in_pnl}
                />
                <Row label="Total Expenses" value={data.total_exp_paisa} bold />

                <Row label="Net Profit" value={data.net_profit_paisa} bold highlight color={data.net_profit_paisa < 0 ? 'red' : 'green'} />
              </tbody>
            </table>
          </div>

          {data.expenses_by_category.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Expenses by Category</h3>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={data.expenses_by_category.map((c) => ({ ...c, total: c.total_paisa / 100 }))} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis type="number" tickFormatter={(n) => `${(n / 1000).toFixed(0)}k`} fontSize={11} />
                    <YAxis type="category" dataKey="category" fontSize={11} width={120} />
                    <Tooltip formatter={(v) => formatPKR(Math.round(Number(v) * 100))} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {data.expenses_by_category.map((c, i) => (
                        <Cell key={i} fill={c.type === 'business' ? '#2563eb' : '#f59e0b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-blue-600" /> Business</span>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-500" /> Home</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr className="bg-gray-50 border-y border-gray-200">
      <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{children}</td>
    </tr>
  );
}

function Row({
  label, value, bold, muted, highlight, color,
}: {
  label: string; value: number; bold?: boolean; muted?: boolean;
  highlight?: boolean; color?: 'red' | 'green';
}) {
  const display = value < 0 ? `(${formatPKR(Math.abs(value))})` : formatPKR(value);
  const txt = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-green-700' : muted ? 'text-gray-400' : 'text-gray-900';
  return (
    <tr className={highlight ? 'bg-blue-50/40' : ''}>
      <td className={`px-4 py-2 ${bold ? 'font-semibold' : ''} ${muted ? 'text-gray-500' : 'text-gray-900'}`}>{label}</td>
      <td className={`px-4 py-2 text-right font-mono tabular-nums ${bold ? 'font-semibold' : ''} ${txt}`}>{display}</td>
    </tr>
  );
}
