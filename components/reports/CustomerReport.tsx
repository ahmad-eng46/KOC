'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowUp, ArrowDown, Search } from 'lucide-react';
import { useCustomerReport } from '@/lib/queries/reports';
import { formatPKR } from '@/lib/money';
import { exportCustomerPdf, exportCustomerExcel } from '@/lib/actions/reports';
import { ExportButtons, KPICard } from './shared';

type SortField = 'name' | 'invoiced' | 'paid' | 'balance' | 'last';
type SortDir = 'asc' | 'desc';

export function CustomerReport() {
  const { data: rows = [], isLoading } = useCustomerReport();
  const [sortField, setSortField] = useState<SortField>('balance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');

  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDir(f === 'name' ? 'asc' : 'desc'); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.customer_name.toLowerCase().includes(q) || (r.phone ?? '').includes(q))
      : rows;
    const sorted = [...base].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name':     return a.customer_name.localeCompare(b.customer_name) * dir;
        case 'invoiced': return (a.invoiced_paisa - b.invoiced_paisa) * dir;
        case 'paid':     return (a.paid_paisa - b.paid_paisa) * dir;
        case 'balance':  return (a.balance_paisa - b.balance_paisa) * dir;
        case 'last':     return ((a.last_activity ?? '') > (b.last_activity ?? '') ? 1 : -1) * dir;
      }
    });
    return sorted;
  }, [rows, search, sortField, sortDir]);

  const totalInvoiced = useMemo(() => filtered.reduce((s, r) => s + r.invoiced_paisa, 0), [filtered]);
  const totalPaid = useMemo(() => filtered.reduce((s, r) => s + r.paid_paisa, 0), [filtered]);
  const totalBalance = useMemo(() => filtered.reduce((s, r) => s + r.balance_paisa, 0), [filtered]);

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
        <ExportButtons onExportPdf={exportCustomerPdf} onExportExcel={exportCustomerExcel} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KPICard label="Total Invoiced" value={formatPKR(totalInvoiced)} />
            <KPICard label="Total Paid" value={formatPKR(totalPaid)} accent="text-green-700" />
            <KPICard label="Outstanding" value={formatPKR(totalBalance)} accent={totalBalance > 0 ? 'text-red-600' : 'text-gray-700'} sub={`${filtered.length} customers`} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm min-w-[34rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortHead field="name"     current={sortField} dir={sortDir} onToggle={toggleSort}>Customer</SortHead>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                  <SortHead field="invoiced" current={sortField} dir={sortDir} onToggle={toggleSort} align="right">Invoiced</SortHead>
                  <SortHead field="paid"     current={sortField} dir={sortDir} onToggle={toggleSort} align="right">Paid</SortHead>
                  <SortHead field="balance"  current={sortField} dir={sortDir} onToggle={toggleSort} align="right">Balance</SortHead>
                  <SortHead field="last"     current={sortField} dir={sortDir} onToggle={toggleSort}>Last Activity</SortHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">No customers match.</td></tr>}
                {filtered.map((r) => (
                  <tr key={r.customer_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/customers/${r.customer_id}`} className="font-medium text-blue-600 hover:underline">{r.customer_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{r.phone ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(r.invoiced_paisa)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatPKR(r.paid_paisa)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-medium ${r.balance_paisa > 0 ? 'text-red-600' : r.balance_paisa < 0 ? 'text-green-700' : 'text-gray-500'}`}>
                      {formatPKR(r.balance_paisa)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-500">
                      {r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : 'Never'}
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

function SortHead({
  field, current, dir, onToggle, align = 'left', children,
}: {
  field: SortField; current: SortField; dir: SortDir;
  onToggle: (f: SortField) => void; align?: 'left' | 'right'; children: React.ReactNode;
}) {
  const active = field === current;
  return (
    <th className={`px-4 py-3 font-medium text-gray-600 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button onClick={() => onToggle(field)} className="inline-flex items-center gap-1 hover:text-gray-900">
        {children}
        {active && (dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );
}
