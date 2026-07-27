'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useCashBook } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportCashBookPdf, exportCashBookExcel } from '@/lib/actions/reports';
import {
  FilterBar, KPICard, ExportButtons, rangeForPreset,
  type DatePreset, type DateRange,
} from './shared';

export function CashBookReport() {
  const [preset, setPreset] = useState<DatePreset>('today');
  const [range, setRange] = useState<DateRange>(rangeForPreset('today'));
  const { data, isLoading } = useCashBook(range);

  return (
    <div className="space-y-4">
      <FilterBar
        preset={preset} range={range} onPresetChange={setPreset} onRangeChange={setRange}
        extras={<div className="flex justify-end"><ExportButtons onExportPdf={() => exportCashBookPdf(range)} onExportExcel={() => exportCashBookExcel(range)} /></div>}
      />

      {isLoading || !data ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KPICard label="Cash In" value={formatPKR(data.total_in_paisa)} accent="text-green-700" />
            <KPICard label="Cash Out" value={formatPKR(data.total_out_paisa)} accent="text-red-600" />
            <KPICard
              label="Closing Balance" value={formatPKR(data.closing_paisa)}
              accent={data.closing_paisa >= 0 ? 'text-gray-900' : 'text-red-600'}
              sub={`${data.entries.length} entries`}
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">In</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.entries.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-gray-400">No cash entries in this period.</td></tr>}
                {data.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 tabular-nums">{format(parseISO(e.date), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {e.kind === 'in' ? (
                          <ArrowDownCircle size={13} className="text-green-600 shrink-0" />
                        ) : (
                          <ArrowUpCircle size={13} className="text-red-500 shrink-0" />
                        )}
                        <span className="text-gray-900">{e.description}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-700">
                      {e.kind === 'in' ? formatPKR(e.amount_paisa) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600">
                      {e.kind === 'out' ? formatPKR(e.amount_paisa) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right text-sm font-semibold">Closing Balance</td>
                  <td colSpan={2} className={`px-4 py-3 text-right font-mono font-semibold text-base ${data.closing_paisa >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    {formatPKR(data.closing_paisa)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
