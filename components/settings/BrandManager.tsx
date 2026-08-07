'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, X, Phone } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useBrands, useInvalidateBrandData, type BrandSummary } from '@/lib/queries/brands';
import { createBrand, updateBrand, deleteBrand } from '@/lib/actions/brands';
import {
  brandSchema, brandTypes, BRAND_TYPE_LABELS, type BrandInput,
} from '@/lib/validators/brands';
import { Field, ServerError, inputCls, textareaCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';

type Props = {
  /** Only admins may delete brands. */
  canDelete: boolean;
};

export function BrandManager({ canDelete }: Props) {
  const { data: brands = [], isLoading } = useBrands();
  const invalidate = useInvalidateBrandData();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<BrandSummary | null>(null);

  async function onDelete(brand: BrandSummary) {
    const suffix =
      brand.product_count > 0
        ? ` ${brand.product_count} product${brand.product_count === 1 ? '' : 's'} will become unbranded.`
        : '';
    if (!confirm(`Delete ${brand.name}?${suffix}`)) return;

    const result = await deleteBrand(brand.id);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    invalidate();
    showToast(
      result.count > 0
        ? `${brand.name} deleted — ${result.count} product${result.count === 1 ? '' : 's'} moved to Unbranded.`
        : `${brand.name} deleted.`,
    );
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
      <div className="flex justify-end">
        <button
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={15} />
          Add Brand
        </button>
      </div>

      {brands.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">No brands yet.</p>
          <button
            onClick={() => setSheetOpen(true)}
            className="mt-3 inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} />
            Add your first brand
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {brands.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-gray-900 truncate">{b.name}</p>
                  {(b.contact_person || b.phone) && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {b.contact_person && <span>Contact: {b.contact_person}</span>}
                      {b.contact_person && b.phone && ' · '}
                      {b.phone && (
                        <a href={`tel:${b.phone}`} className="inline-flex items-center gap-1 text-blue-600">
                          <Phone size={11} />
                          {b.phone}
                        </a>
                      )}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    {b.product_count} {b.product_count === 1 ? 'product' : 'products'}
                    {b.low_stock_count > 0 && (
                      <span className="text-amber-600"> · {b.low_stock_count} low stock</span>
                    )}
                    {b.out_of_stock_count > 0 && (
                      <span className="text-red-600"> · {b.out_of_stock_count} out of stock</span>
                    )}
                  </p>
                </div>
                <span
                  className={[
                    'shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                    b.brand_type === 'local_dealer'
                      ? 'bg-orange-50 text-orange-800'
                      : 'bg-purple-50 text-purple-800',
                  ].join(' ')}
                >
                  {b.brand_type === 'local_dealer' ? 'Local Dealer' : 'Multinational'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-gray-100">
                <button
                  onClick={() => setEditing(b)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100"
                >
                  <Pencil size={12} /> Edit
                </button>
                {canDelete && (
                  <button
                    onClick={() => onDelete(b)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(sheetOpen || editing) && (
        <BrandFormSheet
          brand={editing ?? undefined}
          onClose={() => { setSheetOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** Full brand form — all fields, unlike the picker's two-field quick-create. */
function BrandFormSheet({ brand, onClose }: { brand?: BrandSummary; onClose: () => void }) {
  const { showToast } = useToast();
  const invalidate = useInvalidateBrandData();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: brand?.name ?? '',
      brand_type: brand?.brand_type ?? 'multinational',
      contact_person: brand?.contact_person ?? '',
      phone: brand?.phone ?? '',
      address: brand?.address ?? '',
      notes: brand?.notes ?? '',
      sort_order: brand?.sort_order ?? 0,
    },
  });
  const brandType = useWatch({ control, name: 'brand_type' });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(values: BrandInput) {
    setServerError(null);
    const result = brand ? await updateBrand(brand.id, values) : await createBrand(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    invalidate();
    showToast(brand ? `"${result.name}" updated.` : `Brand "${result.name}" added.`);
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
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {brand ? `Edit ${brand.name}` : 'Add Brand'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <Field label="Brand Name *" error={errors.name?.message}>
            <input className={inputCls(!!errors.name)} placeholder="Double Horse" {...register('name')} />
          </Field>

          <Field label="Type">
            <div className="grid grid-cols-2 gap-2">
              {brandTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue('brand_type', t, { shouldDirty: true })}
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
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact Person" error={errors.contact_person?.message}>
              <input className={inputCls(!!errors.contact_person)} placeholder="Ali Khan" {...register('contact_person')} />
            </Field>
            <Field label="Phone" error={errors.phone?.message}>
              <input className={inputCls(!!errors.phone)} placeholder="0301-1234567" type="tel" inputMode="tel" {...register('phone')} />
            </Field>
          </div>

          <Field label="Address" error={errors.address?.message}>
            <input className={inputCls(!!errors.address)} placeholder="Industrial Area, Lahore" {...register('address')} />
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <textarea className={textareaCls(!!errors.notes)} placeholder="Order terms, rep visit day…" {...register('notes')} />
          </Field>

          <Field label="Sort Order" error={errors.sort_order?.message} hint="Lower shows first in chips and lists">
            <input
              className={inputCls(!!errors.sort_order)}
              placeholder="0"
              inputMode="numeric"
              {...register('sort_order', {
                setValueAs: (v: unknown) => {
                  if (typeof v !== 'string') return v as number;
                  if (v.trim() === '') return 0;
                  const n = parseInt(v, 10);
                  return Number.isNaN(n) ? NaN : n;
                },
              })}
            />
          </Field>

          <ServerError message={serverError} />

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
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : brand ? 'Update Brand' : 'Create Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
