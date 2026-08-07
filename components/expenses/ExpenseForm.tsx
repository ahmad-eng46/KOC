'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, Paperclip, Plus, X } from 'lucide-react';
import { useBusinessStore } from '@/lib/store/business';
import { createClient } from '@/lib/supabase/client';
import { rupeesToPaisa } from '@/lib/money';
import { createExpense } from '@/lib/actions/expense';
import { createExpenseSubType } from '@/lib/actions/expense-assets';
import {
  expenseCategories,
  expenseTypes,
  type ExpenseType,
  type ExpenseCategory,
} from '@/lib/validators/expense';
import { expenseCategoryGroup } from '@/lib/validators/expense-assets';
import {
  useExpenseAssets,
  useExpenseSubTypes,
  useInvalidateExpenseAssetData,
} from '@/lib/queries/expense-assets';
import { AssetPicker } from './AssetPicker';
import { AddAssetSheet } from './AddAssetSheet';
import { useToast } from '@/components/ui/Toast';

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }

export function ExpenseForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<ExpenseType>('business');
  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [amountInput, setAmountInput] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Optional asset tracking — both prefetched once, filtered client-side per
  // category so these fields appear instantly with no loading state.
  const [assetId, setAssetId] = useState<string | null>(null);
  const [subTypeId, setSubTypeId] = useState<string | null>(null);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [newSubTypeName, setNewSubTypeName] = useState<string | null>(null); // null = input hidden
  const [savingSubType, setSavingSubType] = useState(false);
  const { assets } = useExpenseAssets(category);
  const { subTypes } = useExpenseSubTypes(category);
  const invalidateAssetData = useInvalidateExpenseAssetData();
  const { showToast } = useToast();

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  function changeCategory(next: ExpenseCategory) {
    // Asset/sub-type are category-scoped: reset them unless the change stays
    // within the Transport↔Maintenance group (same vehicles, same types).
    const sameGroup =
      expenseCategoryGroup(next).join() === expenseCategoryGroup(category).join();
    if (!sameGroup) {
      setAssetId(null);
      setSubTypeId(null);
      setNewSubTypeName(null);
    }
    setCategory(next);
  }

  async function saveNewSubType() {
    const name = (newSubTypeName ?? '').trim();
    if (!name) return;
    setSavingSubType(true);
    const result = await createExpenseSubType({ category, name });
    setSavingSubType(false);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    invalidateAssetData();
    setSubTypeId(result.id);
    setNewSubTypeName(null);
    showToast(`Type "${name}" added.`);
  }

  const amountPaisa = useMemo(() => {
    const n = parseFloat(amountInput);
    if (isNaN(n) || n <= 0) return 0;
    return rupeesToPaisa(n);
  }, [amountInput]);

  const validationError =
    !category ? 'Pick a category'
      : amountPaisa <= 0 ? 'Enter an amount > 0'
        : !expenseDate ? 'Pick a date'
          : null;

  async function uploadReceiptIfAny(): Promise<string | null> {
    if (!file || !activeId) return null;
    setUploadProgress(50);
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${activeId}/${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploadProgress(100);
    if (error) throw error;
    return data.path;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    setServerError(null);
    setSubmitting(true);

    let receiptPath: string | null = null;
    try {
      receiptPath = await uploadReceiptIfAny();
    } catch (err) {
      setServerError(`Receipt upload failed: ${(err as Error).message}`);
      setSubmitting(false);
      return;
    }

    const r = await createExpense({
      type,
      category,
      description: description.trim() || undefined,
      amount_paisa: amountPaisa,
      expense_date: expenseDate,
      receipt_url: receiptPath,
      asset_id: assetId,
      sub_type_id: subTypeId,
    });

    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['expenses', activeId] });
    router.push('/expenses');
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {expenseTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={[
                'h-11 rounded-xl border text-sm font-medium transition-colors capitalize',
                type === t
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {t === 'business' ? 'Business' : 'Home'}
            </button>
          ))}
        </div>
        {type === 'home' && (
          <p className="text-xs text-gray-500 mt-1.5">
            Home expenses are excluded from P&L by default. Toggle in Settings to include.
          </p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          value={category}
          onChange={(e) => changeCategory(e.target.value as ExpenseCategory)}
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {expenseCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Asset — progressive: only for categories where assets make sense
          (any category that already has assets, or one with type chips).
          Always optional; skipping keeps the old flow intact. */}
      {category !== 'Other' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {expenseCategoryGroup(category).includes('Transport')
              ? 'Vehicle'
              : category === 'Rent'
                ? 'Property'
                : 'Item'}{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <AssetPicker
            assets={assets}
            value={assetId}
            onChange={setAssetId}
            onAddNew={() => setAddAssetOpen(true)}
            categoryLabel={category}
          />
        </div>
      )}

      {/* Expense type — progressive, optional */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Expense Type <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        {newSubTypeName === null ? (
          <select
            value={subTypeId ?? ''}
            onChange={(e) => {
              if (e.target.value === '__add__') {
                setNewSubTypeName('');
                return;
              }
              setSubTypeId(e.target.value || null);
            }}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— None —</option>
            {subTypes.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="__add__">+ Add New Type…</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              value={newSubTypeName}
              onChange={(e) => setNewSubTypeName(e.target.value)}
              placeholder="e.g. Toll Tax"
              autoFocus
              className="flex-1 h-11 px-3 rounded-xl border border-blue-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={saveNewSubType}
              disabled={savingSubType || !(newSubTypeName ?? '').trim()}
              className="h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              <Plus size={14} />
              {savingSubType ? 'Saving…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => setNewSubTypeName(null)}
              className="h-11 px-3 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Amount + Date */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Amount (Rs.) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Receipt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Receipt (optional)</label>
        {file ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-300 bg-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip size={14} className="text-gray-500 shrink-0" />
              <span className="text-sm text-gray-700 truncate">{file.name}</span>
              <span className="text-xs text-gray-500 shrink-0">
                ({(file.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="p-1 rounded text-gray-400 hover:text-red-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-11 px-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center gap-1.5"
          >
            <Paperclip size={14} /> Attach receipt (image or PDF)
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {uploadProgress > 0 && uploadProgress < 100 && (
          <p className="text-xs text-gray-500 mt-1">Uploading {uploadProgress}%…</p>
        )}
      </div>

      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!!validationError || submitting}
          title={validationError ?? undefined}
          className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={15} />
              Save Expense
            </>
          )}
        </button>
      </div>

      {addAssetOpen && (
        <AddAssetSheet
          category={category}
          onClose={() => setAddAssetOpen(false)}
          onCreated={(id) => setAssetId(id)}
        />
      )}
    </form>
  );
}
