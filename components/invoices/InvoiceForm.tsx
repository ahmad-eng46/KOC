'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, X, CheckCircle2 } from 'lucide-react';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';
import { useProducts, type Product } from '@/lib/queries/products';
import { useLastSoldRates, type LastSold } from '@/lib/queries/last-sold';
import { salePriceIsUnset } from '@/lib/validators/product';
import { formatKarachi } from '@/lib/date';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { computeInvoiceTotals, parseRateInput, formatRateInput } from '@/lib/invoice';
import { createInvoice } from '@/lib/actions/invoice';
import type { DiscountType } from '@/lib/validators/invoice';
import { hasPack, toUnits, conversionHint, packOptionLabel, unitOptionLabel, type EntryMode } from '@/lib/pack';
import { useUnsavedChanges } from '@/lib/store/unsaved';
import { CustomerCombobox } from './CustomerCombobox';
import { ProductCombobox } from './ProductCombobox';

type LineItem = {
  key: string;
  product_id: string | null;
  /** What the user typed — boxes when entry_mode is 'pack', units otherwise. */
  quantity: number;
  entry_mode: EntryMode;
  /**
   * Exactly what is in the rate box, not a number. The override is per line and
   * per invoice; it seeds from the product's sale price and never travels back.
   * Keeping the raw text here rather than a parsed paisa value is what lets
   * "12.", "abc" and "" be told apart and reported instead of all collapsing to
   * zero on their way in.
   */
  rate_input: string;
};

type Props = {
  /**
   * Whether this user may type a rate other than the product's. Resolved on the
   * server; the rate still only ever lands on this invoice's line, never on the
   * product.
   */
  canEditRate: boolean;
};

function emptyItem(key: string): LineItem {
  return { key, product_id: null, quantity: 1, entry_mode: 'unit', rate_input: '' };
}

export function InvoiceForm({ canEditRate }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  const { data: customers = [], isLoading: customersLoading } = useCustomersWithBalance();
  const { data: products = [], isLoading: productsLoading } = useProducts();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([emptyItem('item-1')]);
  const idCounter = useRef(2);

  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountInput, setDiscountInput] = useState('');
  const [paymentInput, setPaymentInput] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // A half-built invoice is the most expensive thing in the app to lose, so
  // anything past an empty first row counts: a customer chosen, a product
  // picked, or a discount or payment typed.
  useUnsavedChanges(
    !submitting &&
      (customerId !== null ||
        items.some((it) => it.product_id !== null) ||
        discountInput.trim() !== '' ||
        paymentInput.trim() !== ''),
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const previousBalance = selectedCustomer?.current_balance_paisa ?? 0;
  const customerHasBalance = previousBalance > 0;

  const discountValue = useMemo(() => {
    if (discountType === 'none') return 0;
    const n = parseFloat(discountInput);
    if (isNaN(n) || n < 0) return 0;
    return discountType === 'fixed' ? rupeesToPaisa(n) : n;
  }, [discountType, discountInput]);

  const paymentReceivedPaisa = useMemo(() => {
    const n = parseFloat(paymentInput);
    if (isNaN(n) || n < 0) return 0;
    return rupeesToPaisa(n);
  }, [paymentInput]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /**
   * One lookup for the whole invoice. The ids come from the lines, so adding a
   * line refetches once rather than once per line, and the hook keys on the
   * sorted id list so re-ordering lines changes nothing.
   */
  const lineProductIds = useMemo(
    () => items.map((it) => it.product_id).filter((id): id is string => !!id),
    [items],
  );
  const { data: lastSold } = useLastSoldRates(lineProductIds, customerId);

  /**
   * What the rate box should start at: what it last sold for, else the
   * product's own price, else nothing. An empty box is deliberate — a product
   * that has never sold and carries no price has no rate anyone can stand
   * behind, so it is asked for rather than guessed at.
   */
  const suggestedRatePaisa = useCallback(
    (productId: string | null): number | null => {
      if (!productId) return null;
      const sold = lastSold?.get(productId);
      if (sold) return sold.unitPricePaisa;
      const p = productById.get(productId);
      if (p && !salePriceIsUnset(p.sale_price_paisa)) return p.sale_price_paisa;
      return null;
    },
    [lastSold, productById],
  );

  /**
   * The line items in stock units. A pack entry of 2 on a box of 12 becomes 24
   * here, and everything downstream — totals, the stock guard, what is sent to
   * the server — reads these, never the raw entry. Rates are per unit, so the
   * line total is units x rate exactly as it always was.
   */
  const unitItems = useMemo(
    () =>
      items.map((it) => {
        const p = it.product_id ? productById.get(it.product_id) : undefined;
        const rate = parseRateInput(it.rate_input);
        return {
          ...it,
          quantity: toUnits(it.quantity, it.entry_mode, p?.pack_size ?? 1),
          unit_price_paisa: rate.ok ? rate.paisa : 0,
        };
      }),
    [items, productById],
  );

  /**
   * Only lines that have a product are judged. A blank rate on a blank row is
   * someone who has not started typing yet, not a mistake to shout about.
   */
  const rateErrors = useMemo(() => {
    const out = new Map<string, string>();
    for (const it of items) {
      if (!it.product_id) continue;
      const rate = parseRateInput(it.rate_input);
      if (!rate.ok) out.set(it.key, rate.error);
    }
    return out;
  }, [items]);

  // ★ All math via the unit-tested computeInvoiceTotals — DO NOT inline. ★
  const totals = useMemo(
    () => computeInvoiceTotals(unitItems, discountType, discountValue),
    [unitItems, discountType, discountValue],
  );

  const newBalance = previousBalance + totals.total_paisa - paymentReceivedPaisa;

  // ── Client-side stock warnings ────────────────────
  const stockWarnings = useMemo(() => {
    const warnings: { name: string; requested: number; onHand: number }[] = [];
    const requestedByProduct = new Map<string, number>();
    for (const it of unitItems) {
      if (!it.product_id || it.quantity <= 0) continue;
      requestedByProduct.set(
        it.product_id,
        (requestedByProduct.get(it.product_id) ?? 0) + it.quantity,
      );
    }
    for (const [pid, requested] of requestedByProduct) {
      const p = products.find((x) => x.id === pid);
      if (!p) continue;
      if (p.quantity_on_hand < requested) {
        warnings.push({ name: p.name, requested, onHand: p.quantity_on_hand });
      }
    }
    return warnings;
  }, [unitItems, products]);

  // ── Validation ──────────────────────────────────────
  const validItems = unitItems.filter(
    (it) => it.product_id !== null && it.quantity > 0,
  );

  const validationError: string | null = !customerId
    ? 'Select a customer'
    : validItems.length === 0
      ? 'Add at least one item with a product and quantity'
      : items.some((it) => it.product_id && it.quantity <= 0)
        ? 'Each item with a product must have quantity > 0'
        : rateErrors.size > 0
          ? 'Fix the highlighted rate before saving'
          : null;

  const stockBlocks = stockWarnings.length > 0;

  const canSubmit = !submitting && !validationError && !stockBlocks;

  // ── Item mutations ────────────────────────────────
  function addItem() {
    setItems((prev) => [...prev, emptyItem(`item-${idCounter.current++}`)]);
  }
  function removeItem(key: string) {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((it) => it.key !== key),
    );
  }
  function updateItem(key: string, partial: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...partial } : it)));
  }
  function pickProduct(key: string, productId: string | null) {
    if (!productId) {
      updateItem(key, { product_id: null, rate_input: '', entry_mode: 'unit' });
      return;
    }
    const p = products.find((x) => x.id === productId);
    const suggested = suggestedRatePaisa(productId);
    updateItem(key, {
      product_id: productId,
      rate_input: suggested === null ? '' : formatRateInput(suggested),
      entry_mode: p && hasPack(p) ? 'pack' : 'unit',
    });
  }
  function changeQty(key: string, value: string) {
    const n = parseFloat(value);
    updateItem(key, { quantity: isNaN(n) ? 0 : n });
  }
  function changeRate(key: string, value: string) {
    updateItem(key, { rate_input: value });
  }

  /**
   * Back to the suggested rate, for when an override was a mistake. Resets to
   * whatever the box was pre-filled with, not to the master price — otherwise
   * "reset" would put back a number the line never showed.
   */
  function resetRate(key: string, productId: string | null) {
    const suggested = suggestedRatePaisa(productId);
    updateItem(key, { rate_input: suggested === null ? '' : formatRateInput(suggested) });
  }

  function changeDiscountType(type: DiscountType) {
    setDiscountType(type);
    setDiscountInput('');
  }

  // ── Submit ───────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError(null);
    setSubmitting(true);

    const result = await createInvoice({
      customer_id: customerId!,
      items: validItems.map((it) => {
        const p = productById.get(it.product_id!);
        return {
          product_id: it.product_id!,
          // Units — the server, the stock movement and the ledger never see packs.
          quantity: it.quantity,
          unit_price_paisa: it.unit_price_paisa,
          discount_paisa: 0,
          entered_quantity: items.find((x) => x.key === it.key)?.quantity ?? it.quantity,
          entry_mode: it.entry_mode,
          pack_size_snapshot: p?.pack_size ?? 1,
        };
      }),
      discount_type: discountType,
      discount_value: discountValue,
      payment_received_paisa: paymentReceivedPaisa,
      payment_method: 'cash',
    });

    if (!result.ok) {
      setServerError(result.error);
      setSubmitting(false);
      return;
    }

    // Invalidate dependent caches before navigating
    await queryClient.invalidateQueries({ queryKey: ['invoices', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['products', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['customers-with-balance', activeId] });

    router.push(`/invoices/${result.id}`);
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {/* Customer + balance */}
      <div className="space-y-3">
        <CustomerCombobox
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          loading={customersLoading}
        />

        {selectedCustomer && (
          <div
            className={[
              'rounded-xl px-4 py-3 border',
              customerHasBalance
                ? 'bg-red-50 border-red-200'
                : 'bg-gray-50 border-gray-200',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  Current Balance
                </p>
                <p
                  className={[
                    'text-2xl font-mono font-semibold mt-0.5 tabular-nums',
                    customerHasBalance ? 'text-red-600' : 'text-gray-700',
                  ].join(' ')}
                >
                  {formatPKR(previousBalance)}
                </p>
              </div>
              {customerHasBalance && (
                <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium">
                  <AlertTriangle size={14} />
                  Outstanding
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Line items */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>

        {items.map((item, idx) => (
          <ItemRowCard
            key={item.key}
            item={item}
            products={products}
            productsLoading={productsLoading}
            canRemove={items.length > 1}
            canEditRate={canEditRate}
            onRemove={() => removeItem(item.key)}
            onPickProduct={(pid) => pickProduct(item.key, pid)}
            onChangeQty={(v) => changeQty(item.key, v)}
            onChangeRate={(v) => changeRate(item.key, v)}
            onResetRate={() => resetRate(item.key, item.product_id)}
            rateError={rateErrors.get(item.key) ?? null}
            onChangeMode={(mode) => updateItem(item.key, { entry_mode: mode })}
            lineTotalPaisa={totals.line_totals_paisa[idx] ?? 0}
            suggestedRatePaisa={suggestedRatePaisa(item.product_id)}
            lastSold={(item.product_id && lastSold?.get(item.product_id)) || null}
          />
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full h-11 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus size={14} /> Add another item
        </button>
      </section>

      {/* Discount */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Discount</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex gap-2">
            {(['none', 'fixed', 'percent'] as DiscountType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeDiscountType(t)}
                className={[
                  'flex-1 h-9 rounded-lg border text-sm font-medium transition-colors',
                  discountType === t
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {t === 'none' ? 'None' : t === 'fixed' ? 'Fixed (Rs.)' : 'Percent (%)'}
              </button>
            ))}
          </div>
          {discountType !== 'none' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {discountType === 'fixed' ? 'Discount Amount (Rs.)' : 'Discount Percent (%)'}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder={discountType === 'fixed' ? '0.00' : '0'}
                className="w-full h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>
      </section>

      {/* Totals */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Totals</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <Row label="Subtotal" value={formatPKR(totals.subtotal_paisa)} />
          <Row
            label="Discount"
            value={`− ${formatPKR(totals.discount_paisa)}`}
            valueClass="text-gray-600"
          />
          <div className="border-t border-gray-100 pt-2">
            <Row
              label="Net Total"
              value={formatPKR(totals.total_paisa)}
              labelClass="font-semibold text-gray-900"
              valueClass="font-semibold text-gray-900 text-base"
            />
          </div>

          <div className="pt-3 border-t border-gray-100">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Payment Received (Rs.)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={paymentInput}
              onChange={(e) => setPaymentInput(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <Row
              label="New Balance"
              value={formatBalance(newBalance)}
              labelClass="font-semibold text-gray-900"
              valueClass={
                newBalance > 0
                  ? 'text-red-600 font-semibold text-base'
                  : newBalance < 0
                    ? 'text-green-600 font-semibold text-base'
                    : 'text-gray-700 font-semibold text-base'
              }
            />
            {!selectedCustomer && (
              <p className="text-xs text-gray-400 mt-1.5">
                Select a customer to see the resulting balance.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Stock shortages — hard block */}
      {stockWarnings.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Not enough stock
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-red-800">
                {stockWarnings.map((w) => (
                  <li key={w.name}>
                    • <span className="font-medium">{w.name}</span>: {w.onHand} on hand,
                    selling {w.requested}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-700 mt-2">
                Reduce the quantity, or add stock in Stock → Add movement.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

      {/* Submit */}
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
          disabled={!canSubmit}
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
              Save Invoice
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// Item row card
// ────────────────────────────────────────────────────────────────
type ItemRowProps = {
  item: LineItem;
  products: Product[];
  productsLoading: boolean;
  canRemove: boolean;
  canEditRate: boolean;
  onRemove: () => void;
  onPickProduct: (id: string | null) => void;
  onChangeQty: (v: string) => void;
  onChangeRate: (v: string) => void;
  onResetRate: () => void;
  onChangeMode: (mode: EntryMode) => void;
  rateError: string | null;
  lineTotalPaisa: number;
  /** What the box was pre-filled with; null when nothing could be suggested. */
  suggestedRatePaisa: number | null;
  /** The sale the suggestion came from, when it came from one. */
  lastSold: LastSold | null;
};

function ItemRowCard({
  item,
  products,
  productsLoading,
  canRemove,
  canEditRate,
  onRemove,
  onPickProduct,
  onChangeQty,
  onChangeRate,
  onResetRate,
  onChangeMode,
  rateError,
  lineTotalPaisa,
  suggestedRatePaisa,
  lastSold,
}: ItemRowProps) {
  const product = item.product_id ? products.find((p) => p.id === item.product_id) : undefined;
  const packed = !!product && hasPack(product);
  const hint = product
    ? conversionHint(item.quantity, item.entry_mode, product)
    : null;

  // Compared against what the box was pre-filled with, not the master price:
  // "Was ..." should name the number this line actually started from. Nothing
  // here writes back to the product.
  const parsedRate = parseRateInput(item.rate_input);
  const isOverridden =
    !!product
    && parsedRate.ok
    && suggestedRatePaisa !== null
    && parsedRate.paisa !== suggestedRatePaisa;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 relative">
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        title={canRemove ? 'Remove item' : 'At least one item is required'}
        className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Remove item"
      >
        <X size={14} />
      </button>

      <div className="pr-8">
        <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
        <ProductCombobox
          products={products}
          value={item.product_id}
          onChange={onPickProduct}
          loading={productsLoading}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
          <div className="flex items-stretch gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={item.quantity}
              onChange={(e) => onChangeQty(e.target.value)}
              disabled={!item.product_id}
              className="min-w-0 flex-1 h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            {packed && (
              <select
                value={item.entry_mode}
                onChange={(e) => onChangeMode(e.target.value as EntryMode)}
                aria-label="Quantity unit"
                className="h-10 max-w-24 px-1.5 rounded-xl border border-gray-300 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pack">{packOptionLabel(product!)}</option>
                <option value="unit">{unitOptionLabel(product!)}</option>
              </select>
            )}
          </div>
          {hint && <p className="mt-1 text-xs text-blue-700 font-medium">{hint}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Rate (Rs.)</label>
          <input
            type="text"
            inputMode="decimal"
            value={item.rate_input}
            onChange={(e) => canEditRate && onChangeRate(e.target.value)}
            readOnly={!canEditRate}
            disabled={!item.product_id}
            aria-invalid={!!rateError}
            aria-label="Rate for this line"
            className={[
              'w-full h-10 px-3 rounded-xl border text-sm tabular-nums',
              !canEditRate
                ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                : rateError
                  ? 'border-red-400 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500'
                  : 'border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500',
              !item.product_id ? 'opacity-50' : '',
            ].join(' ')}
            title={
              canEditRate
                ? 'This invoice only — the product\u2019s own price is not changed.'
                : 'Auto-filled from the product.'
            }
          />
          {lastSold && (
            <p className="mt-1 text-xs text-gray-500">
              Last sold: {formatPKR(lastSold.unitPricePaisa)} on{' '}
              {formatKarachi(lastSold.soldOn)}
              {lastSold.forThisCustomer ? ' to this customer' : ''}
            </p>
          )}
          {!lastSold && item.product_id && suggestedRatePaisa === null && (
            <p className="mt-1 text-xs text-amber-700">
              Never sold and no sale price — enter a rate.
            </p>
          )}
          {rateError && <p className="mt-1 text-xs text-red-600">{rateError}</p>}
          {!rateError && isOverridden && (
            <p className="mt-1 text-xs text-amber-700">
              Was {formatPKR(suggestedRatePaisa!, { showSymbol: false })}
              <button
                type="button"
                onClick={onResetRate}
                className="ml-1.5 underline font-medium hover:text-amber-900"
              >
                reset
              </button>
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Amount (Rs.)
          </label>
          <div className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-900 tabular-nums flex items-center justify-end">
            {formatPKR(lineTotalPaisa, { showSymbol: false })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  labelClass,
  valueClass,
}: {
  label: string;
  value: string;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={['text-sm text-gray-500', labelClass].filter(Boolean).join(' ')}>
        {label}
      </span>
      <span
        className={[
          'text-sm font-mono tabular-nums text-gray-900',
          valueClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}

function formatBalance(paisa: number): string {
  if (paisa < 0) return `${formatPKR(Math.abs(paisa))} (Cr)`;
  return formatPKR(paisa);
}
