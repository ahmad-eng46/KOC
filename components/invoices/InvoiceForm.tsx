'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, X, CheckCircle2 } from 'lucide-react';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';
import { useProducts, type Product } from '@/lib/queries/products';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR, paisaToRupees, rupeesToPaisa } from '@/lib/money';
import { computeInvoiceTotals } from '@/lib/invoice';
import { createInvoice } from '@/lib/actions/invoice';
import type { DiscountType } from '@/lib/validators/invoice';
import type { Role } from '@/lib/auth/permissions';
import { CustomerCombobox } from './CustomerCombobox';
import { ProductCombobox } from './ProductCombobox';

type LineItem = {
  key: string;
  product_id: string | null;
  quantity: number;
  unit_price_paisa: number;
};

type Props = {
  role: Role;
};

function emptyItem(key: string): LineItem {
  return { key, product_id: null, quantity: 1, unit_price_paisa: 0 };
}

export function InvoiceForm({ role }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  const { data: customers = [], isLoading: customersLoading } = useCustomersWithBalance();
  const { data: products = [], isLoading: productsLoading } = useProducts();

  const canEditRate = role === 'admin';
  const canOverrideStock = role === 'admin';

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [items, setItems] = useState<LineItem[]>([emptyItem('item-1')]);
  const idCounter = useRef(2);

  const [discountType, setDiscountType] = useState<DiscountType>('none');
  const [discountInput, setDiscountInput] = useState('');
  const [paymentInput, setPaymentInput] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [stockOverride, setStockOverride] = useState(false);

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

  // ★ All math via the unit-tested computeInvoiceTotals — DO NOT inline. ★
  const totals = useMemo(
    () => computeInvoiceTotals(items, discountType, discountValue),
    [items, discountType, discountValue],
  );

  const newBalance = previousBalance + totals.total_paisa - paymentReceivedPaisa;

  // ── Client-side stock warnings ────────────────────
  const stockWarnings = useMemo(() => {
    const warnings: { name: string; requested: number; onHand: number }[] = [];
    const requestedByProduct = new Map<string, number>();
    for (const it of items) {
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
  }, [items, products]);

  // ── Validation ──────────────────────────────────────
  const validItems = items.filter(
    (it) => it.product_id !== null && it.quantity > 0,
  );

  const validationError: string | null = !customerId
    ? 'Select a customer'
    : validItems.length === 0
      ? 'Add at least one item with a product and quantity'
      : items.some((it) => it.product_id && it.quantity <= 0)
        ? 'Each item with a product must have quantity > 0'
        : null;

  const stockBlocks =
    stockWarnings.length > 0 && !canOverrideStock && !stockOverride;

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
      updateItem(key, { product_id: null, unit_price_paisa: 0 });
      return;
    }
    const p = products.find((x) => x.id === productId);
    updateItem(key, {
      product_id: productId,
      unit_price_paisa: p?.sale_price_paisa ?? 0,
    });
  }
  function changeQty(key: string, value: string) {
    const n = parseFloat(value);
    updateItem(key, { quantity: isNaN(n) ? 0 : n });
  }
  function changeRate(key: string, value: string) {
    const n = parseFloat(value);
    updateItem(key, {
      unit_price_paisa: isNaN(n) || n < 0 ? 0 : rupeesToPaisa(n),
    });
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
      items: validItems.map((it) => ({
        product_id: it.product_id!,
        quantity: it.quantity,
        unit_price_paisa: it.unit_price_paisa,
        discount_paisa: 0,
      })),
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
            lineTotalPaisa={totals.line_totals_paisa[idx] ?? 0}
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

      {/* Stock warnings */}
      {stockWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Stock will go negative
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800">
                {stockWarnings.map((w) => (
                  <li key={w.name}>
                    • <span className="font-medium">{w.name}</span>: {w.onHand} on hand,
                    selling {w.requested}
                  </li>
                ))}
              </ul>
              {!canOverrideStock && (
                <p className="text-xs text-amber-700 mt-2">
                  Only an admin can override and proceed with negative stock.
                </p>
              )}
              {canOverrideStock && (
                <label className="inline-flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stockOverride}
                    onChange={(e) => setStockOverride(e.target.checked)}
                    className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-medium text-amber-900">
                    Override and create invoice anyway (admin)
                  </span>
                </label>
              )}
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
  lineTotalPaisa: number;
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
  lineTotalPaisa,
}: ItemRowProps) {
  const [rateText, setRateText] = useState<string | null>(null);

  // Display value — local edit text (admin) or auto-filled product price
  const rateDisplay =
    rateText ??
    (item.unit_price_paisa
      ? paisaToRupees(item.unit_price_paisa).toFixed(2)
      : '0.00');

  function handleRateChange(v: string) {
    setRateText(v);
    onChangeRate(v);
  }

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
          onChange={(pid) => {
            setRateText(null); // reset local rate edit when product changes
            onPickProduct(pid);
          }}
          loading={productsLoading}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
          <input
            type="text"
            inputMode="decimal"
            value={item.quantity}
            onChange={(e) => onChangeQty(e.target.value)}
            disabled={!item.product_id}
            className="w-full h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Rate (Rs.)</label>
          <input
            type="text"
            inputMode="decimal"
            value={rateDisplay}
            onChange={(e) => canEditRate && handleRateChange(e.target.value)}
            readOnly={!canEditRate}
            disabled={!item.product_id}
            className={[
              'w-full h-10 px-3 rounded-xl border text-sm tabular-nums',
              canEditRate
                ? 'border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
                : 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed',
              !item.product_id ? 'opacity-50' : '',
            ].join(' ')}
            title={canEditRate ? 'Editable (admin)' : 'Auto-filled from product. Editable for admins only.'}
          />
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
