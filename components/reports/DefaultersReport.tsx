'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Search, MessageCircle, Printer } from 'lucide-react';
import { useDefaulters } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportDefaultersPdf, exportDefaultersExcel } from '@/lib/actions/reports';
import { ExportButtons, KPICard } from './shared';

export function DefaultersReport() {
  const { data, isLoading } = useDefaulters();
  const [search, setSearch] = useState('');

  const rows = data?.rows ?? [];
  const days = data?.defaulter_days ?? 20;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.customer_name.toLowerCase().includes(q) || (r.phone ?? '').includes(q)) : rows;
  }, [rows, search]);

  const total = filtered.reduce((s, r) => s + r.balance_paisa, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer or phone…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <ExportButtons onExportPdf={exportDefaultersPdf} onExportExcel={exportDefaultersExcel} />
      </div>

      <p className="text-xs text-gray-500">
        Defaulter threshold: <span className="font-mono font-medium">{days} days</span> of inactivity (configurable in Settings).
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KPICard label="Defaulters" value={String(filtered.length)} />
            <KPICard label="Total Outstanding" value={formatPKR(total)} accent="text-red-600" />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Activity</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Days Inactive</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6 text-gray-400">No defaulters.</td></tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.customer_id} className="bg-red-50/50 hover:bg-red-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/customers/${r.customer_id}`} className="font-medium text-blue-600 hover:underline">{r.customer_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : 'Never'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-red-700">{r.days_inactive}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-700">{formatPKR(r.balance_paisa)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled
                        title="WhatsApp reminder coming in Piece 10"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 bg-gray-100 cursor-not-allowed"
                      >
                        <MessageCircle size={12} />
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 inline-flex items-center gap-1.5">
            <Printer size={12} /> Print PDF via the export button above.
          </p>
        </>
      )}
    </div>
  );
}
