'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  productSchemaFor, salePriceIsUnset, type ProductInput,
} from '@/lib/validators/product';
import { createProduct, updateProduct } from '@/lib/actions/product';
import { formatPKR, parseMoneyInput } from '@/lib/money';
import { type Product } from '@/lib/queries/products';
import { packPreview } from '@/lib/pack';
import {
  BASE_UNITS, PACK_NAMES, PACK_DEFAULT_SIZE, hasPack,
  packPriceToUnitPrice, unitPriceToPackPrice,
} from '@/lib/units';
import { useBusinessStore } from '@/lib/store/business';
import { useUnsavedChanges } from '@/lib/store/unsaved';
import { BrandPicker } from './BrandPicker';

type Props = {
  product?: Product;
  canSeePurchasePrice: boolean;
};

/** Which price the owner is typing. Storage stays per unit either way. */
type PriceMode = 'unit' | 'pack';

export function ProductForm({ product, canSeePurchasePrice }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    // Same rule the server will apply: purchase price is required of
    // whoever can actually see the field.
    resolver: zodResolver(productSchemaFor(canSeePurchasePrice)),
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? '',
          unit: product.unit,
          sale_price_paisa: product.sale_price_paisa,
          purchase_price_paisa: product.purchase_price_paisa ?? null,
          low_stock_threshold: product.low_stock_threshold ?? null,
          brand_id: product.brand_id ?? null,
          pack_size: product.pack_size ?? 1,
          pack_name: product.pack_name ?? '',
          is_active: product.is_active,
        }
      : { is_active: true, sale_price_paisa: 0, brand_id: null, pack_size: 1, pack_name: '' },
  });

  // Warns before the back button leaves the page. Cleared while submitting,
  // so saving and navigating away is not treated as abandoning edits.
  useUnsavedChanges(isDirty && !isSubmitting);

  const brandId = useWatch({ control, name: 'brand_id' });
  const unit = useWatch({ control, name: 'unit' });
  const packName = useWatch({ control, name: 'pack_name' });
  const packSize = useWatch({ control, name: 'pack_size' });

  const salePaisa = Number(useWatch({ control, name: 'sale_price_paisa' })) || 0;
  const purchaseWatched = useWatch({ control, name: 'purchase_price_paisa' });
  const purchasePaisa = purchaseWatched == null ? null : Number(purchaseWatched) || 0;

  const size = Number(packSize) || 1;
  const packed = hasPack(size) && !!packName?.trim();
  const unitLabel = unit?.trim() || 'unit';
  const packLabel = packName?.trim() || 'pack';

  /**
   * Which price the owner types. Form state always holds the per-unit price,
   * whichever mode is showing, so submitting needs no conversion at all and
   * there is only one place a pack price can be misread. Defaults to per unit
   * so an existing product opens reading the way it is stored.
   */
  const [priceMode, setPriceMode] = useState<PriceMode>('unit');

  /**
   * Opening stock, on the create form only. Editing a product must not offer
   * it: stock is a ledger, and a correction is a new movement rather than a
   * changed starting number.
   */
  const [openingText, setOpeningText] = useState('');
  const [openingMode, setOpeningMode] = useState<PriceMode>('unit');
  const openingTyped = Number(openingText.replace(/,/g, ''));
  const openingUnits = Number.isFinite(openingTyped) && openingTyped > 0
    ? (openingMode === 'pack' && packed ? openingTyped * size : openingTyped)
    : 0;
  const perPack = packed && priceMode === 'pack';

  /**
   * The text in the boxes. Kept separately from form state because the same
   * stored price shows as two different numbers depending on the mode, and
   * because it must survive a half-typed "12." that parses to nothing yet.
   */
  const [saleText, setSaleText] = useState(() =>
    product && !salePriceIsUnset(product.sale_price_paisa)
      ? formatPKR(product.sale_price_paisa, { showSymbol: false })
      : '');
  const [costText, setCostText] = useState(() =>
    product?.purchase_price_paisa != null
      ? formatPKR(product.purchase_price_paisa, { showSymbol: false })
      : '');

  /**
   * Rupees typed in the current mode -> the per-unit paisa that gets stored.
   *
   * parseMoneyInput rather than parseFloat or parsePKR: these boxes are
   * refilled with grouped text like "9,600.00" when the mode changes, which
   * parseFloat truncates at the comma; and parsePKR would quietly read "abc"
   * as 0 and "-5" as 5. NaN and negatives are passed straight through to the
   * schema so it can reject them by name.
   */
  function toUnitPaisa(text: string): number {
    const paisa = parseMoneyInput(text);
    if (!Number.isFinite(paisa)) return NaN;
    return perPack ? packPriceToUnitPrice(paisa, size).unitPaisa : paisa;
  }

  /**
   * Switching mode re-expresses what is on screen so the number keeps meaning
   * the same money. Without this the figure stays put while its label changes,
   * and on an existing product that silently redefines a stored price.
   */
  function switchMode(next: PriceMode) {
    if (next === priceMode) return;
    const show = (unitPaisa: number) =>
      formatPKR(
        next === 'pack' ? unitPriceToPackPrice(unitPaisa, size) : unitPaisa,
        { showSymbol: false },
      );
    if (saleText.trim() !== '') setSaleText(show(salePaisa));
    if (costText.trim() !== '' && purchasePaisa != null) setCostText(show(purchasePaisa));
    setPriceMode(next);
  }

  /**
   * A pack price cannot always be split into whole paisa, and every invoice
   * multiplies up from the per-unit figure, so the difference is shown before
   * saving rather than discovered in a total afterwards.
   */
  const saleSplit = perPack ? packPriceToUnitPrice(parseMoneyInput(saleText) || 0, size) : null;
  const costSplit = perPack && costText.trim() !== ''
    ? packPriceToUnitPrice(parseMoneyInput(costText) || 0, size)
    : null;
  const inexact = (saleSplit && !saleSplit.exact) || (costSplit && !costSplit.exact);

  const packPreviewText = packPreview({
    unit: unit || 'unit',
    pack_name: packName ?? null,
    pack_size: size,
  });
  // Existing stock is in units, so re-sizing the pack only changes how future
  // quantities are typed — worth saying out loud before they wonder.
  const packSizeChanged =
    !!product && (Number(packSize) || 1) !== (product.pack_size ?? 1);

  async function onSubmit(values: ProductInput) {
    setServerError(null);

    // No conversion here: the price boxes write per-unit paisa into form state
    // as they are typed, whichever mode is showing.
    try {
      const result = product
        ? await updateProduct(product.id, values)
        : await createProduct(values, openingUnits || null);

      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      if (result.warning) {
        // Saved, but not entirely. Staying put is better than navigating away
        // from a message the user needs to act on.
        setServerError(result.warning);
        return;
      }
      // The products list and the invoice product picker both read the
      // ['products'] cache, which has a 30s staleTime — without this the page
      // we are about to push to renders the list from before this save and the
      // new product simply is not there. router.refresh() only re-renders
      // server components and cannot touch a client query cache.
      await queryClient.invalidateQueries({ queryKey: ['products', activeId] });
      await queryClient.invalidateQueries({ queryKey: ['brands', activeId] });

      router.push('/products');
      router.refresh();
    } catch (err) {
      // Permission guards in the actions throw rather than return.
      setServerError(err instanceof Error ? err.message : 'Could not save the product.');
    }
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Brand <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-gray-500 mb-1.5">
          The brand this product carries, like Double Horse. Who you buy it from is not
          set here — that goes on each purchase, so the same product can come from Ali
          one week and Waqas the next.
        </p>
        <BrandPicker
          value={brandId ?? null}
          onChange={(id) => setValue('brand_id', id, { shouldDirty: true })}
          canCreate
          productId={product?.id}
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
        <Field
          label={packed ? `Unit * (what is inside a ${packLabel})` : 'Unit *'}
          error={errors.unit?.message}
        >
          <input
            className={inputCls(!!errors.unit)}
            placeholder="Piece"
            list="units-list"
            {...register('unit')}
          />
          <datalist id="units-list">
            {BASE_UNITS.map((u) => <option key={u} value={u} />)}
          </datalist>
        </Field>
      </div>

      {/* Bulk packaging — optional. Prices stay per unit; only entry changes. */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-700">
            Bulk packaging <span className="text-gray-400 font-normal">(optional)</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            If this comes in boxes or packets, say so here and you can buy and sell by the
            box. Stock and prices stay per {unit || 'unit'}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Pack Name" error={errors.pack_name?.message}>
            <input
              className={inputCls(!!errors.pack_name)}
              placeholder="Carton"
              list="pack-names-list"
              {...register('pack_name', {
                // Picking a pack with a conventional count fills it in, so
                // "Carton" does not sit next to a pack size of 1.
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const preset = PACK_DEFAULT_SIZE[e.target.value.trim()];
                  if (preset && size <= 1) {
                    setValue('pack_size', preset, { shouldDirty: true, shouldValidate: true });
                  }
                },
              })}
            />
            <datalist id="pack-names-list">
              {PACK_NAMES.map((n) => <option key={n} value={n} />)}
            </datalist>
          </Field>
          <Field
            label={`Units per Pack${unit ? ` (${unit})` : ''}`}
            error={errors.pack_size?.message}
          >
            <input
              className={inputCls(!!errors.pack_size)}
              placeholder="12"
              inputMode="numeric"
              {...register('pack_size', {
                setValueAs: (v: unknown) => {
                  if (typeof v !== 'string') return (v as number) ?? 1;
                  if (v.trim() === '') return 1;
                  const n = parseInt(v, 10);
                  return Number.isNaN(n) ? NaN : n;
                },
              })}
            />
          </Field>
        </div>

        {packPreviewText && (
          <p className="text-sm font-medium text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            {packPreviewText}
          </p>
        )}
        {packSizeChanged && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Changing the pack size only affects how quantities are entered from now on.
            Stock already recorded stays as it is — it is counted in {product?.unit ?? 'units'}.
          </p>
        )}
      </div>

      {packed && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">I am entering the price per</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['unit', unitLabel],
              ['pack', packLabel],
            ] as Array<[PriceMode, string]>).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchMode(mode)}
                aria-pressed={priceMode === mode}
                className={[
                  'h-11 rounded-xl border text-sm font-medium capitalize',
                  priceMode === mode
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                ].join(' ')}
              >
                {text}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {perPack
              ? `Type what one ${packLabel} costs. It is saved as the price of one ${unitLabel}.`
              : `Type what one ${unitLabel} costs.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={`Sale Price (Rs.) per ${perPack ? packLabel : unitLabel}`}
          error={errors.sale_price_paisa?.message}
        >
          <input
            name="sale_price_paisa"
            className={inputCls(!!errors.sale_price_paisa)}
            placeholder="0.00"
            inputMode="decimal"
            value={saleText}
            onChange={(e) => {
              setSaleText(e.target.value);
              // Blank is allowed and stores 0, which reads back as "not set".
              setValue('sale_price_paisa', toUnitPaisa(e.target.value), {
                shouldDirty: true, shouldValidate: true,
              });
            }}
          />
        </Field>

        {canSeePurchasePrice && (
          <Field
            label={`Purchase Price (Rs.) per ${perPack ? packLabel : unitLabel} *`}
            error={errors.purchase_price_paisa?.message}
          >
            <input
              name="purchase_price_paisa"
              className={inputCls(!!errors.purchase_price_paisa)}
              placeholder="0.00"
              inputMode="decimal"
              value={costText}
              onChange={(e) => {
                setCostText(e.target.value);
                // Blank means "cost not known", which is a null the column allows.
                setValue(
                  'purchase_price_paisa',
                  e.target.value.trim() === '' ? null : toUnitPaisa(e.target.value),
                  { shouldDirty: true, shouldValidate: true },
                );
              }}
            />
          </Field>
        )}
      </div>

      {packed && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            What gets saved
          </p>
          <PriceLine
            label="Sale"
            unitLabel={unitLabel}
            packLabel={packLabel}
            packSize={size}
            unitPaisa={salePaisa}
          />
          {canSeePurchasePrice && purchasePaisa != null && (
            <PriceLine
              label="Cost"
              unitLabel={unitLabel}
              packLabel={packLabel}
              packSize={size}
              unitPaisa={purchasePaisa}
            />
          )}
          {inexact && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-1.5">
              This price does not divide evenly into {size} {unitLabel}. Prices are stored
              per {unitLabel}, so a {packLabel} works out to{' '}
              {formatPKR(saleSplit?.roundedPackPaisa ?? 0)} rather than the figure typed.
            </p>
          )}
        </div>
      )}

      {!product && (
        <Field
          label={`Opening Stock (${openingMode === 'pack' && packed ? packLabel : unitLabel})`}
        >
          <div className="flex gap-2">
            <input
              name="opening_stock"
              className={inputCls(false)}
              placeholder="0"
              inputMode="decimal"
              value={openingText}
              onChange={(e) => setOpeningText(e.target.value)}
            />
            {packed && (
              <select
                aria-label="Opening stock entered in"
                value={openingMode}
                onChange={(e) => setOpeningMode(e.target.value as PriceMode)}
                className="h-11 px-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-700 shrink-0"
              >
                <option value="unit">{unitLabel}</option>
                <option value="pack">{packLabel}</option>
              </select>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {openingUnits > 0
              ? `Records ${openingUnits} ${unitLabel} as stock in.`
              : 'Leave blank if there is none on the shelf yet.'}
          </p>
        </Field>
      )}

      <Field
        label={`Low Stock Alert (${unitLabel})`}
        error={errors.low_stock_threshold?.message}
      >
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

/** Both sides of one price, so the per-unit figure that is actually stored is never implicit. */
function PriceLine({
  label, unitLabel, packLabel, packSize, unitPaisa,
}: {
  label: string;
  unitLabel: string;
  packLabel: string;
  packSize: number;
  unitPaisa: number;
}) {
  return (
    <p className="text-sm text-gray-800 flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-gray-500 w-10 shrink-0">{label}</span>
      <span className="font-medium tabular-nums">{formatPKR(unitPaisa)}</span>
      <span className="text-gray-500">per {unitLabel}</span>
      <span className="text-gray-300">·</span>
      <span className="font-medium tabular-nums">
        {formatPKR(unitPriceToPackPrice(unitPaisa, packSize))}
      </span>
      <span className="text-gray-500">per {packLabel} of {packSize}</span>
    </p>
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
