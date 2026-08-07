'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Truck, PencilLine } from 'lucide-react';
import { stockMovementSchema, type StockMovementInput } from '@/lib/validators/stock';
import { addStockMovement } from '@/lib/actions/stock';
import { type Product } from '@/lib/queries/products';
import { AddPurchaseModal } from '@/components/suppliers/AddPurchaseModal';

type Props = {
  products: Product[];
  defaultProductId?: string;
  canAdjust: boolean;
  /** Offer the "record a supplier purchase" path (roles with purchases.create). */
  canPurchase?: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AddStockModal({
  products,
  defaultProductId,
  canAdjust,
  canPurchase = false,
  onClose,
  onSuccess,
}: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  // 'choose' interposes only when the purchase path is available; otherwise
  // this modal behaves exactly as before.
  const [mode, setMode] = useState<'choose' | 'manual' | 'purchase'>(
    canPurchase ? 'choose' : 'manual',
  );
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StockMovementInput>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      product_id: defaultProductId ?? '',
      type: 'in',
      quantity: undefined,
      note: '',
    },
  });

  const movementType = watch('type');

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(values: StockMovementInput) {
    setServerError(null);
    const result = await addStockMovement(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    onSuccess();
    onClose();
  }

  if (mode === 'purchase') {
    return (
      <AddPurchaseModal
        defaultProductId={defaultProductId}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  if (mode === 'choose') {
    return (
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Add Stock</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <button
              type="button"
              onClick={() => setMode('purchase')}
              className="w-full flex items-center gap-3 rounded-xl border border-gray-300 px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <span className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0"><Truck size={18} /></span>
              <span>
                <span className="block text-sm font-medium text-gray-900">Purchase from supplier</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Records who you bought from and updates their account
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="w-full flex items-center gap-3 rounded-xl border border-gray-300 px-4 py-3.5 text-left hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <span className="p-2 rounded-lg bg-gray-100 text-gray-600 shrink-0"><PencilLine size={18} /></span>
              <span>
                <span className="block text-sm font-medium text-gray-900">Manual adjustment</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Quick quantity change with no supplier record
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Stock Movement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Product */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Product *</label>
            <select
              className={inputCls(!!errors.product_id)}
              {...register('product_id')}
              disabled={!!defaultProductId}
            >
              <option value="">— Select product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.sku ? ` (${p.sku})` : ''} — stock: {p.quantity_on_hand} {p.unit}
                </option>
              ))}
            </select>
            {errors.product_id && (
              <p className="mt-1 text-xs text-red-600">{errors.product_id.message}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Movement Type *</label>
            <div className="flex gap-2">
              <label className={typeCls(movementType === 'in')}>
                <input type="radio" value="in" {...register('type')} className="sr-only" />
                Stock In
              </label>
              {canAdjust && (
                <label className={typeCls(movementType === 'adjustment')}>
                  <input type="radio" value="adjustment" {...register('type')} className="sr-only" />
                  Adjustment
                </label>
              )}
            </div>
            {movementType === 'adjustment' && (
              <p className="mt-1.5 text-xs text-gray-500">
                Use a negative number to decrease stock (e.g. –5 for shrinkage).
              </p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Quantity *{movementType === 'adjustment' ? ' (negative to decrease)' : ''}
            </label>
            <input
              className={inputCls(!!errors.quantity)}
              placeholder={movementType === 'adjustment' ? 'e.g. -5 or 10' : 'e.g. 50'}
              inputMode="decimal"
              {...register('quantity', {
                setValueAs: (v: unknown) => {
                  if (typeof v !== 'string') return v as number;
                  const n = parseFloat(v);
                  return isNaN(n) ? undefined : n;
                },
              })}
            />
            {errors.quantity && (
              <p className="mt-1 text-xs text-red-600">{errors.quantity.message}</p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
            <input
              className={inputCls(false)}
              placeholder="e.g. Received from supplier"
              {...register('note')}
            />
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
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : 'Save Movement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full h-11 px-3 rounded-xl border text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    hasError ? 'border-red-400' : 'border-gray-300',
  ].join(' ');
}

function typeCls(active: boolean) {
  return [
    'flex-1 h-10 flex items-center justify-center rounded-xl border text-sm font-medium cursor-pointer transition-colors select-none',
    active
      ? 'border-blue-500 bg-blue-50 text-blue-700'
      : 'border-gray-300 text-gray-600 hover:bg-gray-50',
  ].join(' ');
}
