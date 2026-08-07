'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { stockPurchaseSchema, type StockPurchaseInput } from '@/lib/validators/suppliers';
import { createStockPurchase } from '@/lib/actions/suppliers';
import { useSuppliers, useInvalidateSupplierData } from '@/lib/queries/suppliers';
import { useProducts } from '@/lib/queries/products';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { purchaseTotalPaisa } from '@/lib/supplier-totals';
import { Field, ServerError, inputCls, textareaCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';

type Props = {
  /** Pre-selected and locked when opened from a supplier's page. */
  defaultSupplierId?: string;
  defaultProductId?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Rupee text field → integer paisa. Blank/garbage becomes NaN so zod reports it. */
function rupeesFieldToPaisa(v: unknown): number {
  if (typeof v !== 'string') return v as number;
  const trimmed = v.trim();
  if (trimmed === '') return NaN;
  const n = parseFloat(trimmed.replace(/,/g, ''));
  return Number.isNaN(n) ? NaN : rupeesToPaisa(n);
}

function numberField(v: unknown): number {
  if (typeof v !== 'string') return v as number;
  const trimmed = v.trim();
  if (trimmed === '') return NaN;
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? NaN : n;
}

export function AddPurchaseModal({
  defaultSupplierId,
  defaultProductId,
  onClose,
  onSuccess,
}: Props) {
  const { showToast } = useToast();
  const invalidate = useInvalidateSupplierData();
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts();
  const [serverError, setServerError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(stockPurchaseSchema),
    defaultValues: {
      supplier_id: defaultSupplierId ?? '',
      product_id: defaultProductId ?? '',
      quantity: undefined,
      unit_price_paisa: undefined,
      purchase_date: todayISO(),
      notes: '',
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const quantity = useWatch({ control, name: 'quantity' });
  const unitPricePaisa = useWatch({ control, name: 'unit_price_paisa' });
  const productId = useWatch({ control, name: 'product_id' });
  const selectedProduct = products.find((p) => p.id === productId);

  // Previewed with the same arithmetic the RPC uses, so this is exactly what
  // gets stored — see lib/supplier-totals.ts.
  const previewTotal =
    Number.isFinite(quantity) && Number.isFinite(unitPricePaisa)
      ? purchaseTotalPaisa(quantity as number, unitPricePaisa as number)
      : null;

  async function onSubmit(values: StockPurchaseInput) {
    setServerError(null);
    const result = await createStockPurchase(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    invalidate();
    showToast('Purchase recorded and stock updated.');
    onSuccess?.();
    onClose();
  }

  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Purchase</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <Field label="Supplier *" error={errors.supplier_id?.message}>
            <select
              className={inputCls(!!errors.supplier_id)}
              disabled={!!defaultSupplierId}
              {...register('supplier_id')}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Product *" error={errors.product_id?.message}>
            <select
              className={inputCls(!!errors.product_id)}
              disabled={!!defaultProductId}
              {...register('product_id')}
            >
              <option value="">— Select product —</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Quantity *${selectedProduct ? ` (${selectedProduct.unit})` : ''}`}
              error={errors.quantity?.message}
            >
              <input
                className={inputCls(!!errors.quantity)}
                placeholder="40"
                inputMode="decimal"
                {...register('quantity', { setValueAs: numberField })}
              />
            </Field>

            <Field label="Unit Price (Rs.) *" error={errors.unit_price_paisa?.message}>
              <input
                className={inputCls(!!errors.unit_price_paisa)}
                placeholder="1500.00"
                inputMode="decimal"
                {...register('unit_price_paisa', { setValueAs: rupeesFieldToPaisa })}
              />
            </Field>
          </div>

          {/* Total the server will store */}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-base font-semibold text-gray-900 font-mono">
              {previewTotal === null ? '—' : formatPKR(previewTotal)}
            </span>
          </div>

          <Field label="Purchase Date *" error={errors.purchase_date?.message}>
            <input
              type="date"
              className={inputCls(!!errors.purchase_date)}
              {...register('purchase_date')}
            />
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <textarea
              className={textareaCls(!!errors.notes)}
              placeholder="Delivery note number, vehicle…"
              {...register('notes')}
            />
          </Field>

          <p className="text-xs text-gray-500">
            Recording a purchase adds the quantity to stock and sets this product&apos;s
            current cost to the unit price above.
          </p>

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
              {isSubmitting ? 'Saving…' : 'Save Purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
