'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, X } from 'lucide-react';
import { useBrands, useInvalidateBrandData, type BrandSummary } from '@/lib/queries/brands';
import { createBrand } from '@/lib/actions/brands';
import { brandTypes, BRAND_TYPE_LABELS, type BrandType } from '@/lib/validators/brands';
import { useToast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (brandId: string | null) => void;
  /** Quick-create needs admin/accountant; hide the option otherwise. */
  canCreate: boolean;
};

/**
 * "Brand / Supplier" dropdown for the product form: multinationals first,
 * local dealers second, "+ Add new brand" pinned at the bottom. The
 * quick-create sheet asks only name + type — everything else lives in
 * Settings → Brands.
 */
export function BrandPicker({ value, onChange, canCreate }: Props) {
  const { data: brands = [] } = useBrands();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = brands.find((b) => b.id === value) ?? null;
  const multinationals = brands.filter((b) => b.brand_type === 'multinational');
  const dealers = brands.filter((b) => b.brand_type === 'local_dealer');

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
        <span className="truncate">{selected ? selected.name : 'No brand'}</span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              aria-label="Clear brand"
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
          <div className="max-h-60 overflow-y-auto">
            {brands.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No brands yet.</p>
            )}
            <BrandGroup label="Multinational brands" brands={multinationals} value={value} onPick={pick} />
            <BrandGroup label="Local dealers" brands={dealers} value={value} onPick={pick} />
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
              Add new brand
            </button>
          )}
        </div>
      )}

      {createOpen && (
        <QuickCreateBrandSheet
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => onChange(id)}
        />
      )}
    </div>
  );
}

function BrandGroup({
  label, brands, value, onPick,
}: {
  label: string;
  brands: BrandSummary[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  if (brands.length === 0) return null;
  return (
    <div>
      <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      {brands.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onPick(b.id)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-11"
        >
          <span className="text-gray-900 truncate">{b.name}</span>
          {b.id === value && <Check size={15} className="text-blue-600 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

/**
 * Two fields, one tap each, save — the whole flow under five seconds.
 * Bottom sheet on mobile, centred card on desktop.
 */
function QuickCreateBrandSheet({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const invalidate = useInvalidateBrandData();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [brandType, setBrandType] = useState<BrandType>('multinational');
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
    if (name.trim().length < 2) {
      setServerError('Name must be at least 2 characters.');
      return;
    }
    setServerError(null);
    setSubmitting(true);
    const result = await createBrand({
      name: name.trim(),
      brand_type: brandType,
      sort_order: 0,
    });
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    invalidate();
    showToast(`Brand "${result.name}" added.`);
    onCreated(result.id, result.name);
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Brand</h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Double Horse"
              autoFocus
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {brandTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBrandType(t)}
                  className={[
                    'h-11 rounded-xl border text-sm font-medium transition-colors',
                    brandType === t
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {BRAND_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
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
    </div>
  );
}
