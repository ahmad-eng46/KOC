'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock } from 'lucide-react';
import { formatPKR, parseMoneyInput } from '@/lib/money';
import { useRequestChange } from '@/lib/queries/deletion-requests';

type Props = {
  purchaseId: string;
  productName: string;
  supplierName: string;
  purchaseDate: string;
  quantity: number;
  unit: string;
  /**
   * NULL for a staff member: the database withholds cost prices from them
   * (iron rule #3). The rate field is then not shown at all, rather than shown
   * empty — you cannot sensibly ask someone to correct a number they are not
   * allowed to read.
   */
  currentRatePaisa: number | null;
  onClose: () => void;
  onDone?: () => void;
};

/**
 * What a staff member gets where an admin gets CorrectRateModal.
 *
 * The two look alike on purpose — the same fields, the same figures — because
 * the difference is not what is being asked for but who decides. Staff hold no
 * UPDATE on stock_purchases at the database level, so nothing here writes to
 * the purchase: it files a request and the row stays exactly as it was until
 * an admin approves.
 *
 * Rate and quantity only. The wider set the RPC accepts (date, notes) is not
 * offered here because those are not what anyone asks to change on a purchase
 * they got wrong; adding them later is a form change, not a schema one.
 */
export function RequestRateChangeModal({
  purchaseId, productName, supplierName, purchaseDate, quantity, unit,
  currentRatePaisa, onClose, onDone,
}: Props) {
  const canSeeRate = currentRatePaisa !== null;
  const [rateText, setRateText] = useState(
    canSeeRate ? formatPKR(currentRatePaisa, { showSymbol: false }) : '',
  );
  const [qtyText, setQtyText] = useState(String(quantity));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useRequestChange();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ratePaisa = parseMoneyInput(rateText);
  const qty = Number(qtyText);
  const rateValid = !canSeeRate || (Number.isFinite(ratePaisa) && ratePaisa >= 0);
  const qtyValid = Number.isFinite(qty) && qty > 0;

  const rateChanged = canSeeRate && rateValid && ratePaisa !== currentRatePaisa;
  const qtyChanged = qtyValid && qty !== quantity;
  const anythingChanged = rateChanged || qtyChanged;

  async function submit() {
    if (!rateValid) { setError('Enter a valid rate.'); return; }
    if (!qtyValid) { setError('Enter a quantity greater than zero.'); return; }
    if (!anythingChanged) {
      setError(canSeeRate ? 'Change the rate or the quantity first.' : 'Change the quantity first.');
      return;
    }

    setError(null);
    const result = await mutation.mutateAsync({
      entity_type: 'stock_purchase',
      entity_id: purchaseId,
      reason: reason.trim(),
      proposed_changes: {
        ...(rateChanged ? { unit_price_paisa: ratePaisa } : {}),
        ...(qtyChanged ? { quantity: qty } : {}),
      },
    });

    if (!result.ok) { setError(result.error); return; }
    onDone?.();
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            Request a change
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">
            Only an admin can change a recorded purchase. Your request is sent for
            approval, and this purchase stays exactly as it is until then.
          </p>

          <dl className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-0.5">
            <Row label="Product" value={productName} />
            <Row label="Supplier" value={supplierName} />
            <Row label="Date" value={purchaseDate} />
          </dl>

          <div className={canSeeRate ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label htmlFor="req-qty" className="block text-sm font-medium text-gray-700 mb-1.5">
                Quantity ({unit})
              </label>
              <input
                id="req-qty"
                inputMode="decimal"
                value={qtyText}
                onChange={(e) => setQtyText(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {qtyChanged && (
                <p className="mt-1 text-xs text-blue-700">was {quantity}</p>
              )}
            </div>
            {canSeeRate && (
            <div>
              <label htmlFor="req-rate" className="block text-sm font-medium text-gray-700 mb-1.5">
                Rate (Rs.)
              </label>
              <input
                id="req-rate"
                inputMode="decimal"
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {rateChanged && (
                <p className="mt-1 text-xs text-blue-700">
                  was {formatPKR(currentRatePaisa ?? 0, { showSymbol: false })}
                </p>
              )}
            </div>
            )}
          </div>

          <div>
            <label htmlFor="req-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
              Why does it need changing?
            </label>
            <textarea
              id="req-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="The delivery note says 120, not 100"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              The admin sees this, so say what they would need to know.
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
              disabled={mutation.isPending || !anythingChanged}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Sending…' : 'Send request'}
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
      <dt className="text-gray-500 w-20 shrink-0">{label}</dt>
      <dd className="text-gray-800 min-w-0 truncate">{value}</dd>
    </div>
  );
}
