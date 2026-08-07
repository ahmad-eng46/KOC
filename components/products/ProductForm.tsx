'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { productSchema, type ProductInput } from '@/lib/validators/product';
import { createProduct, updateProduct } from '@/lib/actions/product';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { type Product } from '@/lib/queries/products';
import { BrandPicker } from './BrandPicker';

type Props = {
  product?: Product;
  canSeePurchasePrice: boolean;
};

const COMMON_UNITS = ['Litre', 'KG', 'Piece', 'Box', 'Carton', 'Dozen', 'Bag', 'Tin', 'Bottle', 'Drum'];

export function ProductForm({ product, canSeePurchasePrice }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? '',
          unit: product.unit,
          sale_price_paisa: product.sale_price_paisa,
          purchase_price_paisa: product.purchase_price_paisa ?? null,
          low_stock_threshold: product.low_stock_threshold ?? null,
          brand_id: product.brand_id ?? null,
          is_active: product.is_active,
        }
      : { is_active: true, sale_price_paisa: 0, brand_id: null },
  });

  const brandId = useWatch({ control, name: 'brand_id' });

  async function onSubmit(values: ProductInput) {
    setServerError(null);
    const result = product
      ? await updateProduct(product.id, values)
      : await createProduct(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    router.push('/products');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Field label="Product Name *" error={errors.name?.message}>
        <input
          className={inputCls(!!errors.name)}
          placeholder="Motor Oil 20W-50"
          {...register('name')}
        />
      </Field>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Brand / Supplier <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <BrandPicker
          value={brandId ?? null}
          onChange={(id) => setValue('brand_id', id, { shouldDirty: true })}
          canCreate
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="SKU / Code" error={errors.sku?.message}>
          <input
            className={inputCls(!!errors.sku)}
            placeholder="OIL-20W50"
            {...register('sku')}
          />
        </Field>
        <Field label="Unit *" error={errors.unit?.message}>
          <input
            className={inputCls(!!errors.unit)}
            placeholder="Litre"
            list="units-list"
            {...register('unit')}
          />
          <datalist id="units-list">
            {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Sale Price (Rs.) *" error={errors.sale_price_paisa?.message}>
          <input
            className={inputCls(!!errors.sale_price_paisa)}
            placeholder="0.00"
            inputMode="decimal"
            defaultValue={product ? formatPKR(product.sale_price_paisa, { showSymbol: false }) : '0.00'}
            {...register('sale_price_paisa', {
              setValueAs: (v: unknown) =>
                typeof v === 'string' ? rupeesToPaisa(parseFloat(v) || 0) : (v as number),
            })}
          />
        </Field>

        {canSeePurchasePrice && (
          <Field label="Purchase Price (Rs.)" error={errors.purchase_price_paisa?.message}>
            <input
              className={inputCls(!!errors.purchase_price_paisa)}
              placeholder="0.00"
              inputMode="decimal"
              defaultValue={
                product?.purchase_price_paisa != null
                  ? formatPKR(product.purchase_price_paisa, { showSymbol: false })
                  : '0.00'
              }
              {...register('purchase_price_paisa', {
                setValueAs: (v: unknown) => {
                  if (typeof v !== 'string') return v as number | null;
                  const n = parseFloat(v);
                  return isNaN(n) ? null : rupeesToPaisa(n);
                },
              })}
            />
          </Field>
        )}
      </div>

      <Field label="Low Stock Alert (units)" error={errors.low_stock_threshold?.message}>
        <input
          className={inputCls(!!errors.low_stock_threshold)}
          placeholder="10"
          inputMode="numeric"
          {...register('low_stock_threshold', {
            setValueAs: (v: unknown) => {
              if (typeof v !== 'string') return v as number | null;
              const n = parseInt(v, 10);
              return isNaN(n) ? null : n;
            },
          })}
        />
      </Field>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="is_active"
          className="w-4 h-4 rounded border-gray-300 text-blue-600"
          {...register('is_active')}
        />
        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
          Active (visible in invoices and stock)
        </label>
      </div>

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : product ? 'Update Product' : 'Create Product'}
        </button>
      </div>
    </form>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full h-11 px-3 rounded-xl border text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    hasError ? 'border-red-400' : 'border-gray-300',
  ].join(' ');
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
