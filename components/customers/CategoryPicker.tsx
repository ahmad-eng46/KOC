'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus, X, Search } from 'lucide-react';
import {
  useCustomerCategories, useInvalidateCustomerCategories,
  type CustomerCategory,
} from '@/lib/queries/customer-categories';
import { createCustomerCategory } from '@/lib/actions/customer-categories';
import { categoryColor } from '@/lib/validators/customer-categories';
import { useToast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  /** Quick-create needs admin/accountant; hide the option otherwise. */
  canCreate: boolean;
};

/**
 * Category dropdown for the customer form, built on the same bones as
 * BrandPicker: searchable list, "+ Add new category" pinned at the bottom, and
 * a portalled quick-create sheet that asks for a name and nothing else.
 */
export function CategoryPicker({ value, onChange, canCreate }: Props) {
  const { data: categories = [] } = useCustomerCategories();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.id === value) ?? null;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, search]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-11 px-3 rounded-xl border text-sm bg-white flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          selected ? 'border-blue-300 text-gray-900' : 'border-gray-300 text-gray-400',
        ].join(' ')}
      >
        <span className="flex items-center gap-2 truncate">
          {selected && (
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: categoryColor(selected.id, selected.color) }}
              aria-hidden
            />
          )}
          <span className="truncate">{selected ? selected.name : 'No category'}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              aria-label="Clear category"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={15} className="text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {categories.length > 6 && (
            <div className="relative border-b border-gray-100">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories…"
                autoFocus
                className="w-full h-10 pl-8 pr-3 text-sm focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {categories.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No categories yet.</p>
            )}
            {categories.length > 0 && visible.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No category matches.</p>
            )}

            {visible.map((c) => (
              <CategoryOption key={c.id} category={c} selected={c.id === value} onPick={pick} />
            ))}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-green-700 border-t border-gray-100 hover:bg-green-50 min-h-11"
            >
              <Plus size={15} />
              Add new category
            </button>
          )}
        </div>
      )}

      {createOpen && (
        <QuickCreateCategorySheet
          initialName={search.trim()}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => onChange(id)}
        />
      )}
    </div>
  );
}

function CategoryOption({
  category, selected, onPick,
}: {
  category: CustomerCategory;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(category.id)}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-11"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: categoryColor(category.id, category.color) }}
          aria-hidden
        />
        <span className="text-gray-900 truncate">{category.name}</span>
      </span>
      {selected && <Check size={15} className="text-blue-600 shrink-0" />}
    </button>
  );
}

/**
 * One field, one tap: type the name, save, done.
 *
 * Portalled to <body> for the same reason BrandPicker is: this sits inside
 * CustomerForm's <form>, and a <form> nested in a <form> is invalid HTML — the
 * submit would bubble into the customer form's handler and save the customer
 * before this request was ever sent. React portals still propagate events
 * through the React tree, so the handler stops propagation too.
 */
function QuickCreateCategorySheet({
  initialName, onClose, onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const invalidate = useInvalidateCustomerCategories();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (name.trim().length < 2) {
      setServerError('Name must be at least 2 characters.');
      return;
    }
    setServerError(null);
    setSubmitting(true);

    try {
      const result = await createCustomerCategory({
        name: name.trim(),
        sort_order: 0,
        is_active: true,
      });

      if (!result.ok) {
        setServerError(result.error);
        showToast(result.error, 'error');
        return;
      }

      // Awaited before selecting, so the dropdown already holds the new
      // category — otherwise the picker reads "No category" for a beat and the
      // selection looks like it did not take.
      await invalidate();
      onCreated(result.id, result.name);
      onClose();
      showToast(`Category "${result.name}" added and selected.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the category.';
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Category</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category Name *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Retailer, Workshop, Petrol Pump…"
              autoFocus
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Colour, description and order can be set later in Settings.
            </p>
          </div>

          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
