'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR } from '@/lib/money';
import { exportLocationPdf, exportLocationExcel } from '@/lib/actions/reports';
import { fetchLocationReportAction } from '@/lib/actions/location-report';
import {
  FilterBar, ExportButtons, KPICard,
  rangeForPreset, type DatePreset, type DateRange,
} from './shared';

/**
 * Location | Customers | Sales | Outstanding | Paid | Collection %.
 * Sales/Paid respect the date range; Outstanding is the live balance.
 */
export function LocationReport() {
  const activeId = useBusinessStore((s) => s.activeId);
  const [preset, setPreset] = useState<DatePreset>('month');
  const [range, setRange] = useState<DateRange>(rangeForPreset('month'));

  const { data, isLoading } = useQuery({
    queryKey: ['report-location', activeId, range.from, range.to],
    enabled: !!activeId,
    queryFn: () => fetchLocationReportAction(range),
  });

  const rows = data?.ok ? data.rows : [];
  const totals = data?.ok ? data.totals : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterBar
          preset={preset}
          range={range}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
        <ExportButtons
          onExportPdf={() => exportLocationPdf(range)}
          onExportExcel={() => exportLocationExcel(range)}
        />
      </div>

      {data && !data.ok && (
        <p className="text-sm text-red-600">{data.error}</p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KPICard label="Sales (period)" value={formatPKR(totals.sales)} />
              <KPICard label="Collected (period)" value={formatPKR(totals.paid)} accent="text-green-700" />
              <KPICard
                label="Outstanding (all-time)"
                value={formatPKR(totals.outstanding)}
                accent={totals.outstanding > 0 ? 'text-red-600' : 'text-gray-700'}
              />
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[38rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Customers</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Sales</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Paid</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Outstanding</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Collection %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                      No locations yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.location_id ?? 'unassigned'} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.location_id ? (
                        <Link href={`/locations/${r.location_id}`} className="hover:text-blue-600">
                          {r.location_name}
                        </Link>
                      ) : (
                        <span className="italic text-gray-500">{r.location_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{r.customer_count}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatPKR(r.sales_paisa)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">
                      {formatPKR(r.paid_paisa)}
                    </td>
                    <td
                      className={[
                        'px-4 py-3 text-right font-mono font-medium',
                        r.outstanding_paisa > 0 ? 'text-red-600' : 'text-gray-500',
                      ].join(' ')}
                    >
                      {formatPKR(r.outstanding_paisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {r.collection_pct === null ? '—' : `${r.collection_pct}%`}
                    </td>
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
