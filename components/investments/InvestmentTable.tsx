'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Plus, TrendingUp } from 'lucide-react';
import { useInvestments } from '@/lib/queries/investments';
import { formatPKR } from '@/lib/money';

export function InvestmentTable() {
  const { data: rows = [], isLoading } = useInvestments();
  const total = useMemo(() => rows.reduce((s, r) => s + r.amount_paisa, 0), [rows]);
  const investorCount = useMemo(() => new Set(rows.map((r) => r.investor_name)).size, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Running total card */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-700 font-medium">Total Invested</p>
            <p className="text-3xl font-mono font-semibold text-blue-900 mt-1 tabular-nums">
              {formatPKR(total)}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · {investorCount} source{investorCount === 1 ? '' : 's'}
            </p>
          </div>
          <TrendingUp size={32} className="text-blue-600" />
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <Link
          href="/investments/new"
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} /> New Investment
        </Link>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Source / Investor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Note</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                  No investments recorded yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 tabular-nums">{format(parseISO(r.investment_date), 'dd MMM yyyy')}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{r.investor_name}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.notes ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono font-medium">{formatPKR(r.amount_paisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2 mt-4">
        {rows.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">No investments recorded yet.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900 text-sm">{r.investor_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{format(parseISO(r.investment_date), 'dd MMM yyyy')}</p>
                {r.notes && <p className="text-xs text-gray-600 mt-1">{r.notes}</p>}
              </div>
              <p className="text-sm font-mono font-medium text-gray-900 shrink-0">{formatPKR(r.amount_paisa)}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
