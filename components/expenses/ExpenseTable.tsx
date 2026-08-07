'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns';
import {
  Search, Calendar, Plus, Paperclip, Trash2,
  List, Layers, ChevronDown, ChevronRight, Car, MapPin, Inbox,
} from 'lucide-react';
import {
  useExpenses, useDeleteExpense,
  type ExpenseFilters, type ExpenseRow,
} from '@/lib/queries/expenses';
import { expenseTypes, expenseCategories, type ExpenseType } from '@/lib/validators/expense';
import { useExpenseAssets } from '@/lib/queries/expense-assets';
import { createClient } from '@/lib/supabase/client';
import { formatPKR } from '@/lib/money';
import type { Role } from '@/lib/auth/permissions';

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }

type PeriodPreset = 'month' | '3m' | '6m' | 'year' | 'custom';

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  month: 'This Month',
  '3m': 'Last 3 Months',
  '6m': 'Last 6 Months',
  year: 'This Year',
  custom: 'Custom',
};

function rangeForPeriod(p: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = todayISO();
  switch (p) {
    case 'month': return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to };
    case '3m':    return { from: format(subMonths(now, 3), 'yyyy-MM-dd'), to };
    case '6m':    return { from: format(subMonths(now, 6), 'yyyy-MM-dd'), to };
    case 'year':  return { from: format(startOfYear(now), 'yyyy-MM-dd'), to };
    case 'custom': return { from: to, to };
  }
}

type Props = { role: Role };

export function ExpenseTable({ role }: Props) {
  const [period, setPeriod] = useState<PeriodPreset>('month');
  const [from, setFrom] = useState(rangeForPeriod('month').from);
  const [to, setTo] = useState(todayISO());
  const [typeFilters, setTypeFilters] = useState<ExpenseType[]>([]);
  const [category, setCategory] = useState(''); // '' = all
  const [assetId, setAssetId] = useState('');   // '' = all, 'untracked' = none
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grouped'>('list');

  const { assets: categoryAssets } = useExpenseAssets(category || undefined);

  const filters: ExpenseFilters = useMemo(
    () => ({
      from,
      to,
      types: typeFilters,
      // A concrete asset shows ALL its expenses regardless of category —
      // a car filed under Transport must also surface its Maintenance rows.
      category: assetId && assetId !== 'untracked' ? undefined : category || undefined,
      assetId: (assetId || undefined) as ExpenseFilters['assetId'],
    }),
    [from, to, typeFilters, category, assetId],
  );
  const { data: rows = [], isLoading } = useExpenses(filters);
  const deleteMutation = useDeleteExpense();

  function changePeriod(p: PeriodPreset) {
    setPeriod(p);
    if (p !== 'custom') {
      const r = rangeForPeriod(p);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  function changeCategory(c: string) {
    setCategory(c);
    setAssetId(''); // asset filter is category-scoped
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.category.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        (r.asset_name ?? '').toLowerCase().includes(q) ||
        (r.sub_type_name ?? '').toLowerCase().includes(q),
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
        {/* Category chips — horizontal scroll on mobile */}
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-0.5">
          <CategoryChip label="All" active={category === ''} onClick={() => changeCategory('')} />
          {expenseCategories.map((c) => (
            <CategoryChip key={c} label={c} active={category === c} onClick={() => changeCategory(c)} />
          ))}
        </div>

        {/* Asset chips — appear once a category with assets is selected */}
        {category && categoryAssets.length > 0 && (
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-0.5">
            <CategoryChip label="All items" active={assetId === ''} onClick={() => setAssetId('')} />
            {categoryAssets.map((a) => (
              <CategoryChip
                key={a.id}
                label={a.name}
                active={assetId === a.id}
                onClick={() => setAssetId(assetId === a.id ? '' : a.id)}
              />
            ))}
            <CategoryChip
              label="Untracked"
              active={assetId === 'untracked'}
              onClick={() => setAssetId(assetId === 'untracked' ? '' : 'untracked')}
            />
          </div>
        )}

        {/* Period presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 mr-1">Period:</span>
          {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => changePeriod(p)}
              className={[
                'px-3 h-7 text-xs font-medium rounded-full border transition-colors',
                period === p
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {period === 'custom' && (
            <>
              <DateInput label="From" value={from} onChange={setFrom} />
              <DateInput label="To" value={to} onChange={setTo} />
            </>
          )}
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Category, item, type or note…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* List / grouped toggle */}
          <div className="flex rounded-xl border border-gray-300 overflow-hidden shrink-0">
            <button
              onClick={() => setView('list')}
              title="List view"
              className={[
                'h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium',
                view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              <List size={14} /> List
            </button>
            <button
              onClick={() => setView('grouped')}
              title="Group by item"
              className={[
                'h-10 px-3 inline-flex items-center gap-1.5 text-xs font-medium border-l border-gray-300',
                view === 'grouped' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              <Layers size={14} /> By Item
            </button>
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

      {view === 'grouped' ? (
        <GroupedByAsset rows={filtered} />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Item / Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Note</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-400 text-sm">
                      No expenses match these filters.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 tabular-nums">{format(parseISO(r.expense_date), 'dd MMM yyyy')}</td>
                    <td className="px-4 py-3">
                      <TypeBadge type={r.type} includeInPnl={r.include_in_pnl} />
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={r.category} />
                    </td>
                    <td className="px-4 py-3">
                      <AssetSubTypeBadges assetName={r.asset_name} subTypeName={r.sub_type_name} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-48 truncate">{r.description ?? '—'}</td>
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
              <p className="text-center py-8 text-sm text-gray-400">No expenses match these filters.</p>
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <TypeBadge type={r.type} includeInPnl={r.include_in_pnl} />
                      <AssetSubTypeBadges assetName={r.asset_name} subTypeName={r.sub_type_name} />
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
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Grouped-by-asset view: one collapsible section per asset (plus an
// "Untracked" bucket for rows with no asset), each with its own total.
// Groups honour the Transport↔Maintenance merge automatically because
// grouping is by asset, not category.
// ─────────────────────────────────────────────
function GroupedByAsset({ rows }: { rows: ExpenseRow[] }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; category: string | null; rows: ExpenseRow[]; total: number }>();
    for (const r of rows) {
      const key = r.asset_id ?? 'untracked';
      const g = map.get(key) ?? {
        name: r.asset_name ?? 'Untracked',
        category: r.asset_id ? r.category : null,
        rows: [],
        total: 0,
      };
      g.rows.push(r);
      g.total += r.amount_paisa;
      map.set(key, g);
    }
    // Biggest spenders first; Untracked always last.
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'untracked') return 1;
      if (b[0] === 'untracked') return -1;
      return b[1].total - a[1].total;
    });
  }, [rows]);

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (rows.length === 0) {
    return <p className="text-center py-10 text-sm text-gray-400 mt-4">No expenses match these filters.</p>;
  }

  return (
    <div className="space-y-3 mt-4">
      {groups.map(([key, g]) => {
        const isCollapsed = collapsed.has(key);
        const isUntracked = key === 'untracked';
        return (
          <div key={key} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 min-h-13"
            >
              {isCollapsed
                ? <ChevronRight size={16} className="text-gray-400 shrink-0" />
                : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
              <span className="p-1.5 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                {isUntracked ? <Inbox size={15} /> : g.category === 'Rent' ? <MapPin size={15} /> : <Car size={15} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-gray-900 text-sm truncate">{g.name}</span>
                <span className="block text-xs text-gray-500">
                  {g.rows.length} {g.rows.length === 1 ? 'expense' : 'expenses'}
                </span>
              </span>
              <span className="font-mono font-bold text-sm text-gray-900 shrink-0">
                {formatPKR(g.total)}
              </span>
            </button>

            {!isCollapsed && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {g.rows.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 pl-12">
                    <span className="text-xs text-gray-500 tabular-nums w-20 shrink-0">
                      {format(parseISO(r.expense_date), 'dd MMM')}
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                      {r.sub_type_name ?? r.description ?? r.category}
                    </span>
                    <span className="font-mono text-sm text-gray-900 shrink-0">
                      {formatPKR(r.amount_paisa)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Rent: 'bg-purple-50 text-purple-700',
  Utilities: 'bg-cyan-50 text-cyan-700',
  Salary: 'bg-green-50 text-green-700',
  Transport: 'bg-orange-50 text-orange-700',
  Food: 'bg-pink-50 text-pink-700',
  'Office Supplies': 'bg-indigo-50 text-indigo-700',
  Maintenance: 'bg-amber-50 text-amber-700',
  Other: 'bg-gray-100 text-gray-600',
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other}`}>
      {category}
    </span>
  );
}

function AssetSubTypeBadges({
  assetName, subTypeName,
}: { assetName: string | null; subTypeName: string | null }) {
  if (!assetName && !subTypeName) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {assetName && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          {assetName}
        </span>
      )}
      {subTypeName && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {subTypeName}
        </span>
      )}
    </span>
  );
}

function CategoryChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-9 px-3.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors shrink-0',
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
      ].join(' ')}
    >
      {label}
    </button>
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
