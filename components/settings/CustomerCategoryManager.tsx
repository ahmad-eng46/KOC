'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X, ArrowUp, ArrowDown, EyeOff } from 'lucide-react';
import {
  useCustomerCategoriesWithCounts, useInvalidateCustomerCategories,
  type CustomerCategoryWithCount,
} from '@/lib/queries/customer-categories';
import {
  createCustomerCategory, updateCustomerCategory, deleteCustomerCategory,
} from '@/lib/actions/customer-categories';
import { categoryColor, isHexColor } from '@/lib/validators/customer-categories';
import { useToast } from '@/components/ui/Toast';

type Props = {
  /** Only admins may delete a category. */
  canDelete: boolean;
};

export function CustomerCategoryManager({ canDelete }: Props) {
  const { data: categories = [], isLoading } = useCustomerCategoriesWithCounts();
  const invalidate = useInvalidateCustomerCategories();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerCategoryWithCount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function onDelete(category: CustomerCategoryWithCount) {
    const suffix =
      category.customer_count > 0
        ? `\n\n${category.customer_count} customer${category.customer_count === 1 ? '' : 's'} will become uncategorized.`
        : '';
    if (!confirm(`Delete ${category.name}?${suffix}`)) return;

    setBusy(category.id);
    try {
      const result = await deleteCustomerCategory(category.id);
      if (!result.ok) {
        showToast(result.error, 'error');
        return;
      }
      await invalidate();
      showToast(
        result.uncategorised > 0
          ? `${category.name} deleted — ${result.uncategorised} customer${result.uncategorised === 1 ? '' : 's'} now uncategorized.`
          : `${category.name} deleted.`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete the category.', 'error');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Reordering swaps sort_order with the neighbour rather than renumbering the
   * list — two writes instead of N, and nothing else moves.
   */
  async function move(index: number, direction: -1 | 1) {
    const a = categories[index];
    const b = categories[index + direction];
    if (!a || !b) return;

    setBusy(a.id);
    try {
      const results = await Promise.all([
        updateCustomerCategory(a.id, { sort_order: b.sort_order }),
        updateCustomerCategory(b.id, { sort_order: a.sort_order }),
      ]);
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        showToast(failed.error, 'error');
        return;
      }
      await invalidate();
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(category: CustomerCategoryWithCount) {
    setBusy(category.id);
    try {
      const r = await updateCustomerCategory(category.id, { is_active: !category.is_active });
      if (!r.ok) {
        showToast(r.error, 'error');
        return;
      }
      await invalidate();
      showToast(category.is_active ? `${category.name} hidden.` : `${category.name} shown again.`);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => { setEditing(null); setSheetOpen(true); }}
          className="inline-flex items-center gap-1.5 h-11 sm:h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">
          No categories yet. Add one to start filing customers.
        </p>
      ) : (
        <ul className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {categories.map((c, i) => (
            <li
              key={c.id}
              className={['flex items-center gap-3 px-4 py-3', c.is_active ? '' : 'opacity-60'].join(' ')}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: categoryColor(c.id, c.color) }}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {c.name}
                  {!c.is_active && (
                    <span className="ml-2 text-xs font-normal text-gray-500">(hidden)</span>
                  )}
                </p>
                {c.description && (
                  <p className="text-xs text-gray-500 truncate">{c.description}</p>
                )}
              </div>

              <span className="text-xs text-gray-500 tabular-nums shrink-0">
                {c.customer_count} customer{c.customer_count === 1 ? '' : 's'}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                <IconButton
                  label="Move up"
                  disabled={i === 0 || busy === c.id}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton
                  label="Move down"
                  disabled={i === categories.length - 1 || busy === c.id}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton
                  label={c.is_active ? 'Hide' : 'Show'}
                  disabled={busy === c.id}
                  onClick={() => toggleActive(c)}
                >
                  <EyeOff size={15} />
                </IconButton>
                <IconButton
                  label="Edit"
                  disabled={busy === c.id}
                  onClick={() => { setEditing(c); setSheetOpen(true); }}
                >
                  <Pencil size={15} />
                </IconButton>
                {canDelete && (
                  <IconButton label="Delete" danger disabled={busy === c.id} onClick={() => onDelete(c)}>
                    <Trash2 size={15} />
                  </IconButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-400">
        Hiding a category keeps it on the customers already filed under it but takes it out of the
        dropdown. Deleting one leaves those customers uncategorized.
      </p>

      {sheetOpen && (
        <CategorySheet
          category={editing}
          onClose={() => setSheetOpen(false)}
          onSaved={async () => {
            await invalidate();
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}

function IconButton({
  label, children, onClick, disabled, danger,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg disabled:opacity-30',
        danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
function CategorySheet({
  category, onClose, onSaved,
}: {
  category: CustomerCategoryWithCount | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [color, setColor] = useState(category?.color ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const colorInvalid = color.trim() !== '' && !isHexColor(color);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    if (colorInvalid) {
      setError('Enter a colour like #FF5733, or leave it blank.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        color: color.trim(),
      };
      const result = category
        ? await updateCustomerCategory(category.id, payload)
        : await createCustomerCategory({ ...payload, sort_order: 0, is_active: true });

      if (!result.ok) {
        setError(result.error);
        showToast(result.error, 'error');
        return;
      }
      await onSaved();
      showToast(category ? `${payload.name} updated.` : `${payload.name} added.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the category.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {category ? `Edit ${category.name}` : 'New Category'}
          </h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Retailer, Workshop, Petrol Pump…"
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of customer belongs here"
              className="w-full h-20 px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Badge colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isHexColor(color) ? color : categoryColor(category?.id ?? name, null)}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Pick a colour"
                className="w-11 h-11 rounded-xl border border-gray-300 bg-white p-1 cursor-pointer"
              />
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#FF5733 — leave blank for automatic"
                className="flex-1 h-11 px-3 rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {color && (
                <button
                  type="button"
                  onClick={() => setColor('')}
                  aria-label="Clear colour"
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {colorInvalid && (
              <p className="mt-1 text-xs text-red-600">Enter a colour like #FF5733.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{error}</p>
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
              disabled={submitting || name.trim().length < 2 || colorInvalid}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
