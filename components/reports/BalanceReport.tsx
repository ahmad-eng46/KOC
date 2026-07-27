'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Search } from 'lucide-react';
import { useBalanceReport } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportBalancePdf, exportBalanceExcel } from '@/lib/actions/reports';
import { ExportButtons, KPICard } from './shared';

const BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;

export function BalanceReport() {
  const { balanceRows, isLoading } = useBalanceReport();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = q
      ? balanceRows.filter((r) => r.customer_name.toLowerCase().includes(q) || (r.phone ?? '').includes(q))
      : balanceRows;
    return [...rows].sort((a, b) => b.balance_paisa - a.balance_paisa);
  }, [balanceRows, search]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.balance_paisa, 0), [filtered]);
  const buckets = useMemo(() => {
    const out: Record<typeof BUCKETS[number], number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const r of filtered) out[r.bucket] += r.balance_paisa;
    return out;
  }, [filtered]);

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
        <ExportButtons onExportPdf={exportBalancePdf} onExportExcel={exportBalanceExcel} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KPICard label="Total Receivable" value={formatPKR(total)} accent="text-red-600" sub={`${filtered.length} customers`} />
            {BUCKETS.map((b) => (
              <KPICard
                key={b} label={`${b} days`} value={formatPKR(buckets[b])}
                accent={b === '90+' ? 'text-red-700' : b === '61-90' ? 'text-amber-700' : 'text-gray-900'}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Last Activity</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Days</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Bucket</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No customers with outstanding balance.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.customer_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/customers/${r.customer_id}`} className="font-medium text-blue-600 hover:underline">{r.customer_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{r.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : 'Never'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.days_inactive}</td>
                    <td className="px-4 py-2.5">
                      <BucketBadge bucket={r.bucket} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium text-red-600">{formatPKR(r.balance_paisa)}</td>
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

function BucketBadge({ bucket }: { bucket: typeof BUCKETS[number] }) {
  const styles: Record<typeof BUCKETS[number], string> = {
    '0-30':  'bg-green-50  text-green-700',
    '31-60': 'bg-blue-50   text-blue-700',
    '61-90': 'bg-amber-50  text-amber-700',
    '90+':   'bg-red-50    text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[bucket]}`}>
      {bucket}
    </span>
  );
}
