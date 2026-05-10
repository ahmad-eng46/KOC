'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO, isAfter } from 'date-fns';
import { Plus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useLoans, useMarkLoanRepaid, type LoanFilters } from '@/lib/queries/loans';
import { loanDirections, type LoanDirection } from '@/lib/validators/loan';
import { formatPKR } from '@/lib/money';

const DIRECTION_LABEL: Record<LoanDirection, string> = {
  given: 'Given',
  taken: 'Taken',
};

export function LoanTable() {
  const [directions, setDirections] = useState<LoanDirection[]>([]);
  const [status, setStatus] = useState<'all' | 'pending' | 'repaid'>('all');

  const filters: LoanFilters = useMemo(() => ({ directions, status }), [directions, status]);
  const { data: rows = [], isLoading } = useLoans(filters);
  const markRepaid = useMarkLoanRepaid();

  const givenOutstanding = rows
    .filter((r) => r.direction === 'given' && !r.is_settled)
    .reduce((s, r) => s + r.balance_paisa, 0);
  const takenOutstanding = rows
    .filter((r) => r.direction === 'taken' && !r.is_settled)
    .reduce((s, r) => s + r.balance_paisa, 0);

  function toggleDirection(d: LoanDirection) {
    setDirections((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function onMarkRepaid(id: string, summary: string) {
    if (!confirm(`Mark this loan as repaid?\n${summary}`)) return;
    await markRepaid.mutateAsync(id);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Outstanding cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Given (outstanding)" value={formatPKR(givenOutstanding)} accent="text-emerald-700" />
        <SummaryCard label="Taken (outstanding)" value={formatPKR(takenOutstanding)} accent="text-red-700" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500">Type:</span>
          {loanDirections.map((d) => (
            <button
              key={d}
              onClick={() => toggleDirection(d)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border',
                directions.includes(d)
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Status:</span>
          {(['all', 'pending', 'repaid'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border capitalize',
                status === s
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {s}
            </button>
          ))}
        </div>
        <Link
          href="/loans/new"
          className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} /> New Loan
        </Link>
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Party</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">
                  No loans match.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const overdue = !r.is_settled && r.due_date && isAfter(new Date(), parseISO(r.due_date));
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 tabular-nums">{format(parseISO(r.loan_date), 'dd MMM yyyy')}</td>
                  <td className="px-4 py-3">
                    <DirectionBadge direction={r.direction} />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.party_name}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{formatPKR(r.balance_paisa)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.due_date ? (
                      <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-700'}>
                        {format(parseISO(r.due_date), 'dd MMM yyyy')}
                        {overdue && <AlertTriangle size={11} className="inline ml-1" />}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.is_settled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        Repaid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!r.is_settled && (
                      <button
                        onClick={() => onMarkRepaid(r.id, `${r.party_name} · ${formatPKR(r.balance_paisa)}`)}
                        disabled={markRepaid.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                      >
                        <CheckCircle2 size={12} /> Mark Repaid
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2 mt-4">
        {rows.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">No loans match.</p>
        )}
        {rows.map((r) => {
          const overdue = !r.is_settled && r.due_date && isAfter(new Date(), parseISO(r.due_date));
          return (
            <div key={r.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{r.party_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <DirectionBadge direction={r.direction} />
                    {r.is_settled ? (
                      <span className="text-xs text-green-700 font-medium">Repaid</span>
                    ) : (
                      <span className="text-xs text-amber-700 font-medium">Pending</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {format(parseISO(r.loan_date), 'dd MMM yyyy')}
                    {r.due_date && (
                      <> · Due {format(parseISO(r.due_date), 'dd MMM')}{overdue && ' ⚠'}</>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p className="text-sm font-mono font-medium">{formatPKR(r.balance_paisa)}</p>
                  {!r.is_settled && (
                    <button
                      onClick={() => onMarkRepaid(r.id, `${r.party_name} · ${formatPKR(r.balance_paisa)}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-green-700 bg-green-50"
                    >
                      <CheckCircle2 size={10} /> Repaid
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DirectionBadge({ direction }: { direction: LoanDirection }) {
  const styles =
    direction === 'given'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles}`}>
      {direction}
    </span>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className={`text-lg font-mono font-semibold mt-0.5 tabular-nums ${accent ?? 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
