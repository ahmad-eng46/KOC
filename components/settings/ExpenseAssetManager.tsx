'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Car, MapPin, Package2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useExpenseAssets, useExpenseSubTypes, useExpenseSummary,
  useInvalidateExpenseAssetData,
  type ExpenseAsset,
} from '@/lib/queries/expense-assets';
import {
  deleteExpenseAsset, createExpenseSubType, deleteExpenseSubType,
} from '@/lib/actions/expense-assets';
import { type ExpenseCategory } from '@/lib/validators/expense';
import { buildAssetBreakdown } from '@/lib/expense-analytics';
import { formatPKR } from '@/lib/money';
import { AddAssetSheet } from '@/components/expenses/AddAssetSheet';
import { useToast } from '@/components/ui/Toast';

type Props = {
  /** Only admins may delete assets / sub-types. */
  canDelete: boolean;
};

// One tab per category GROUP: Transport+Maintenance collapse into one tab
// because they share vehicles — two tabs showing the same cars would be
// confusing. 'Other' has no assets by design (the form hides the field).
const TABS: { key: string; label: string; categories: ExpenseCategory[] }[] = [
  { key: 'vehicles', label: 'Vehicles', categories: ['Transport', 'Maintenance'] },
  { key: 'rent', label: 'Rent', categories: ['Rent'] },
  { key: 'utilities', label: 'Utilities', categories: ['Utilities'] },
  { key: 'salary', label: 'Salary', categories: ['Salary'] },
  { key: 'food', label: 'Food', categories: ['Food'] },
  { key: 'office', label: 'Office Supplies', categories: ['Office Supplies'] },
];

export function ExpenseAssetManager({ canDelete }: Props) {
  const { showToast } = useToast();
  const invalidate = useInvalidateExpenseAssetData();
  const [tabKey, setTabKey] = useState('vehicles');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseAsset | null>(null);
  const [typesOpen, setTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [savingType, setSavingType] = useState(false);

  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const primaryCategory = tab.categories[0];

  const { assets: allAssets, isLoading } = useExpenseAssets();
  const { subTypes: allSubTypes } = useExpenseSubTypes();
  const { data: summaryRows = [] } = useExpenseSummary({});
  const now = useMemo(() => new Date(), []);

  const tabAssets = allAssets.filter((a) => tab.categories.includes(a.category as ExpenseCategory));
  const tabSubTypes = allSubTypes.filter((s) =>
    tab.categories.includes(s.category as ExpenseCategory),
  );

  // Per-asset totals (all-time + this month) from the same view the reports use.
  const totals = useMemo(() => {
    const rows = buildAssetBreakdown(summaryRows, now);
    return new Map(rows.map((r) => [r.key, r.periods]));
  }, [summaryRows, now]);

  async function onDeleteAsset(asset: ExpenseAsset) {
    const linked = summaryRows
      .filter((r) => r.asset_id === asset.id)
      .reduce((s, r) => s + r.transaction_count, 0);
    const warning =
      linked > 0
        ? `"${asset.name}" has ${linked} expense${linked === 1 ? '' : 's'} linked. They keep the name for history, but the item disappears from dropdowns.\n\nDelete it?`
        : `Delete "${asset.name}"?`;
    if (!confirm(warning)) return;

    const result = await deleteExpenseAsset(asset.id);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    invalidate();
    showToast(`"${asset.name}" deleted.`);
  }

  async function onAddType() {
    const name = newTypeName.trim();
    if (!name) return;
    setSavingType(true);
    const result = await createExpenseSubType({ category: primaryCategory, name });
    setSavingType(false);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    invalidate();
    setNewTypeName('');
    showToast(`Type "${name}" added.`);
  }

  async function onDeleteType(id: string, name: string) {
    if (!confirm(`Delete expense type "${name}"? Existing expenses keep the name.`)) return;
    const result = await deleteExpenseSubType(id);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    invalidate();
    showToast(`Type "${name}" deleted.`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-5 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTabKey(t.key); setTypesOpen(false); setNewTypeName(''); }}
              className={[
                'py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tabKey === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Asset cards */}
      <div className="flex justify-end">
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          Add {tab.key === 'vehicles' ? 'Vehicle' : tab.key === 'rent' ? 'Property' : 'Item'}
        </button>
      </div>

      {tabAssets.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          Nothing here yet. Add your first {tab.key === 'vehicles' ? 'car or bike' : 'item'}.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tabAssets.map((a) => {
            const p = totals.get(a.id);
            const d = a.details as Record<string, unknown>;
            const subtitle = [
              typeof d.make === 'string' ? d.make : null,
              typeof d.model === 'string' ? d.model : null,
              typeof d.year === 'number' ? String(d.year) : null,
              typeof d.fuel_type === 'string' ? d.fuel_type.toUpperCase() : null,
              typeof d.address === 'string' ? d.address : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={a.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col">
                <div className="flex items-start gap-2.5">
                  <span className="p-2 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                    {tab.key === 'vehicles' ? <Car size={16} /> : tab.key === 'rent' ? <MapPin size={16} /> : <Package2 size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 text-sm truncate">{a.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate capitalize">
                      {subtitle || a.asset_type || '—'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                  <div className="rounded-lg bg-gray-50 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Total Spent</p>
                    <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5">
                      {formatPKR(p?.total ?? 0, { showSymbol: false })}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">This Month</p>
                    <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5">
                      {formatPKR(p?.thisMonth ?? 0, { showSymbol: false })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1 mt-3 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setEditing(a)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  {canDelete && (
                    <button
                      onClick={() => onDeleteAsset(a)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${a.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sub-types — collapsible per tab */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setTypesOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3.5 text-left hover:bg-gray-50 min-h-13"
        >
          {typesOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          <span className="flex-1 text-sm font-semibold text-gray-900">
            Expense Types for {tab.label}
          </span>
          <span className="text-xs text-gray-400">{tabSubTypes.length}</span>
        </button>

        {typesOpen && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {tabSubTypes.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-gray-100 text-sm text-gray-700"
                >
                  {s.name}
                  {canDelete && (
                    <button
                      onClick={() => onDeleteType(s.id, s.name)}
                      className="p-0.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              ))}
              {tabSubTypes.length === 0 && (
                <p className="text-sm text-gray-400">No types yet.</p>
              )}
            </div>
            <div className="flex gap-2 max-w-sm">
              <input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="New type, e.g. Toll Tax"
                className="flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={onAddType}
                disabled={savingType || !newTypeName.trim()}
                className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {savingType ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        )}
      </div>

      {(addOpen || editing) && (
        <AddAssetSheet
          category={(editing?.category as ExpenseCategory) ?? primaryCategory}
          asset={editing ?? undefined}
          onClose={() => { setAddOpen(false); setEditing(null); }}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}
