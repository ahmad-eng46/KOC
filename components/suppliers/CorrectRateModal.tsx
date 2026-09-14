'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { formatPKR, parseMoneyInput } from '@/lib/money';
import { useCorrectPurchaseRate } from '@/lib/queries/suppliers';

type Props = {
  purchaseId: string;
  productName: string;
  supplierName: string;
  purchaseDate: string;
  quantity: number;
  unit: string;
  currentRatePaisa: number;
  onClose: () => void;
  onDone?: (syncedProductCost: boolean) => void;
};

/**
 * Change the rate on a purchase that was already recorded.
 *
 * The consequences are shown before committing, because they reach further
 * than the row being edited: the supplier's payable is derived from these
 * totals, so it moves too, and if this is the product's most recent purchase
 * its cost price is brought into line. Invoices already issued keep the cost
 * they were sold at, which is why this cannot rewrite past profit.
 */
export function CorrectRateModal({
  purchaseId, productName, supplierName, purchaseDate, quantity, unit,
  currentRatePaisa, onClose, onDone,
}: Props) {
  const [text, setText] = useState(formatPKR(currentRatePaisa, { showSymbol: false }));
  const [syncCost, setSyncCost] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mutation = useCorrectPurchaseRate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const paisa = parseMoneyInput(text);
  const valid = Number.isFinite(paisa) && paisa >= 0;
  const changed = valid && paisa !== currentRatePaisa;
  const newTotal = valid ? Math.round(quantity * paisa) : 0;
  const oldTotal = Math.round(quantity * currentRatePaisa);
  const delta = newTotal - oldTotal;

  async function submit() {
    if (!Number.isFinite(paisa)) { setError('Enter a valid rate.'); return; }
    if (paisa < 0) { setError('A purchase rate cannot be negative.'); return; }
    if (!changed) { onClose(); return; }

    setError(null);
    const result = await mutation.mutateAsync({
      purchaseId, unitPricePaisa: paisa, syncProductCost: syncCost,
    });
    if (!result.ok) { setError(result.error); return; }
    onDone?.(result.syncedProductCost);
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900">Change purchase rate</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <dl className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-0.5">
            <Row label="Product" value={productName} />
            <Row label="Supplier" value={supplierName} />
            <Row label="Date" value={purchaseDate} />
            <Row label="Quantity" value={`${quantity} ${unit}`} />
            <Row label="Current rate" value={formatPKR(currentRatePaisa)} />
          </dl>

          <div>
            <label htmlFor="new-rate" className="block text-sm font-medium text-gray-700 mb-1.5">
              New rate (Rs.) per {unit} *
            </label>
            <input
              id="new-rate"
              autoFocus
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {changed && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                What changes
              </p>
              <p className="text-sm text-gray-800">
                Purchase total {formatPKR(oldTotal)} → {' '}
                <span className="font-medium">{formatPKR(newTotal)}</span>
              </p>
              <p className="text-sm text-gray-800">
                {supplierName} will be owed{' '}
                <span className="font-medium">
                  {delta === 0 ? 'the same' : `${delta > 0 ? 'Rs. ' : '−Rs. '}${formatPKR(Math.abs(delta), { showSymbol: false })} ${delta > 0 ? 'more' : 'less'}`}
                </span>
              </p>
            </div>
          )}

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={syncCost}
              onChange={(e) => setSyncCost(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">
              Also update the product&apos;s cost price
              <span className="block text-xs text-gray-500">
                Applies only if this is the newest purchase of this product. An older
                one is history and will not overwrite a newer cost.
              </span>
            </span>
          </label>

          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Invoices already issued keep the cost they were sold at, so past profit
              is not rewritten. Stock valuation and the supplier&apos;s balance will move.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mutation.isPending || !valid}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : 'Save rate'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <dt className="text-gray-500 w-24 shrink-0">{label}</dt>
      <dd className="text-gray-800 min-w-0 truncate">{value}</dd>
    </div>
  );
}
