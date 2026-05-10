'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO, subDays } from 'date-fns';
import { Search, Calendar, Plus, Paperclip, Trash2 } from 'lucide-react';
import { useExpenses, useDeleteExpense, type ExpenseFilters } from '@/lib/queries/expenses';
import { expenseTypes, type ExpenseType } from '@/lib/validators/expense';
import { useBusinessStore } from '@/lib/store/business';
import { createClient } from '@/lib/supabase/client';
import { formatPKR } from '@/lib/money';
import type { Role } from '@/lib/auth/permissions';

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }
function thirtyDaysAgoISO() { return format(subDays(new Date(), 30), 'yyyy-MM-dd'); }

type Props = { role: Role };

export function ExpenseTable({ role }: Props) {
  const activeId = useBusinessStore((s) => s.activeId);
  const [from, setFrom] = useState(thirtyDaysAgoISO());
  const [to, setTo] = useState(todayISO());
  const [typeFilters, setTypeFilters] = useState<ExpenseType[]>([]);
  const [search, setSearch] = useState('');

  const filters: ExpenseFilters = useMemo(
    () => ({ from, to, types: typeFilters }),
    [from, to, typeFilters],
  );
  const { data: rows = [], isLoading } = useExpenses(filters);
  const deleteMutation = useDeleteExpense();

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.category.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const total = useMemo(() => filtered.reduce((s, r) => s + r.amount_paisa, 0), [filtered]);
  const businessTotal = useMemo(
    () => filtered.filter((r) => r.type === 'business').reduce((s, r) => s + r.amount_paisa, 0),
    [filtered],
  );
  const homeTotal = total - businessTotal;

  const canDelete = role === 'admin';

  function toggleType(t: ExpenseType) {
    setTypeFilters((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function openReceipt(path: string) {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (error || !data) {
      alert(`Could not open receipt: ${error?.message ?? 'unknown'}`);
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function onDelete(id: string, summary: string) {
    if (!confirm(`Delete this expense?\n${summary}`)) return;
    await deleteMutation.mutateAsync(id);
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
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Category or note…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
          >
            <Plus size={15} /> New Expense
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Type:</span>
          {expenseTypes.map((t) => (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border transition-colors capitalize',
                typeFilters.includes(t)
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
          {typeFilters.length > 0 && (
            <button onClick={() => setTypeFilters([])} className="text-xs text-gray-500 hover:text-gray-900">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <SummaryCard label="Total" value={formatPKR(total)} />
        <SummaryCard label="Business" value={formatPKR(businessTotal)} accent="text-gray-900" />
        <SummaryCard label="Home" value={formatPKR(homeTotal)} accent="text-amber-700" />
      </div>

      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Note</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                  No expenses in this date range.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 tabular-nums">{format(parseISO(r.expense_date), 'dd MMM yyyy')}</td>
                <td className="px-4 py-3">
                  <TypeBadge type={r.type} includeInPnl={r.include_in_pnl} />
                </td>
                <td className="px-4 py-3 text-gray-900">{r.category}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{r.description ?? '—'}</td>
                <td className="px-4 py-3 text-right font-mono font-medium">{formatPKR(r.amount_paisa)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {r.receipt_url && (
                      <button
                        onClick={() => openReceipt(r.receipt_url!)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        title="View receipt"
                      >
                        <Paperclip size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(r.id, `${r.category} · ${formatPKR(r.amount_paisa)}`)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2 mt-4">
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">No expenses in this date range.</p>
        )}
        {filtered.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm">{r.category}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(parseISO(r.expense_date), 'dd MMM yyyy')}
                </p>
                {r.description && <p className="text-xs text-gray-600 mt-1">{r.description}</p>}
                <div className="mt-1.5">
                  <TypeBadge type={r.type} includeInPnl={r.include_in_pnl} />
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <p className="text-sm font-mono font-medium text-gray-900">{formatPKR(r.amount_paisa)}</p>
                <div className="flex items-center gap-1">
                  {r.receipt_url && (
                    <button onClick={() => openReceipt(r.receipt_url!)}
                      className="p-1 rounded text-gray-400 hover:text-blue-600">
                      <Paperclip size={13} />
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => onDelete(r.id, `${r.category} · ${formatPKR(r.amount_paisa)}`)}
                      className="p-1 rounded text-gray-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SummaryCard({
  label, value, accent,
}: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</p>
      <p className={`text-lg font-mono font-semibold mt-0.5 tabular-nums ${accent ?? 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function TypeBadge({ type, includeInPnl }: { type: ExpenseType; includeInPnl: boolean }) {
  const styles =
    type === 'business'
      ? 'bg-blue-50 text-blue-700'
      : 'bg-amber-50 text-amber-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles}`}>
      {type}{!includeInPnl && type === 'home' ? ' · excl. P&L' : ''}
    </span>
  );
}

function DateInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
