'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Scale, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { formatPKR } from '@/lib/money';
import { useAdjustCustomerBalance } from '@/lib/queries/customers';
import { useAdjustSupplierBalance } from '@/lib/queries/suppliers';
import { describeAdjustment, reasonIsAdequate } from '@/lib/balance-adjustment';

type Party = 'customer' | 'supplier';

type Props = {
  party: Party;
  partyId: string;
  partyName: string;
  currentBalancePaisa: number;
  onClose: () => void;
  onDone?: () => void;
};

/**
 * Which way a positive balance points differs by party, and getting it
 * backwards is the one mistake this dialog could invite: for a customer the
 * money is owed TO the business, for a supplier it is owed BY it.
 */
const WORDING: Record<Party, { hint: string; debit: string; credit: string }> = {
  customer: {
    hint: 'A positive figure is money the customer owes you.',
    debit: 'increases what they owe',
    credit: 'reduces what they owe',
  },
  supplier: {
    hint: 'A positive figure is money you owe the supplier.',
    debit: 'increases what you owe',
    credit: 'reduces what you owe',
  },
};

/**
 * Correcting a balance, the only way the books allow it: by saying what the
 * balance should be and why.
 *
 * The admin types a target, not a difference. That is what they are actually
 * thinking — "he owes 12,000, not 15,000" — and it removes the one mistake a
 * delta invites, which is applying the same correction twice. The difference
 * is shown, not typed, so they can see the entry that is about to be posted
 * before they agree to it.
 *
 * Nothing here overwrites anything. The RPC posts a dated 'adjustment' entry
 * and the balance stays the sum of its transactions (0075).
 */
export function AdjustBalanceModal({
  party, partyId, partyName, currentBalancePaisa, onClose, onDone,
}: Props) {
  const [targetText, setTargetText] = useState(
    formatPKR(currentBalancePaisa, { showSymbol: false }),
  );
  const [reason, setReason] = useState('');
  const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState<string | null>(null);
  // Both hooks are created because hooks cannot be called conditionally; only
  // the one matching the party is ever fired.
  const customerMutation = useAdjustCustomerBalance(partyId);
  const supplierMutation = useAdjustSupplierBalance(partyId);
  const mutation = party === 'customer' ? customerMutation : supplierMutation;
  const words = WORDING[party];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { targetPaisa: target, differencePaisa: difference, valid: targetValid, postable } =
    describeAdjustment(currentBalancePaisa, targetText);
  const reasonValid = reasonIsAdequate(reason);
  const canSubmit = postable && reasonValid;

  async function submit() {
    if (!targetValid) { setError('Enter a valid amount.'); return; }
    if (!postable) { setError('That is already the balance — nothing to change.'); return; }
    if (!reasonValid) { setError('Say why the balance is being changed.'); return; }

    setError(null);
    const result = await mutation.mutateAsync({
      targetBalancePaisa: target,
      reason: reason.trim(),
      entryDate,
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
            <Scale size={16} className="text-blue-600" />
            Adjust balance
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
            This posts a dated correction to {partyName}&apos;s ledger. Nothing
            already recorded is changed or removed.
          </p>

          <div>
            <label htmlFor="adj-target" className="block text-sm font-medium text-gray-700 mb-1.5">
              What should the balance be? (Rs.)
            </label>
            <input
              id="adj-target"
              inputMode="decimal"
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">{words.hint}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
              <span className="text-gray-500">{formatPKR(currentBalancePaisa)}</span>
              <ArrowRight size={13} className="text-gray-400 shrink-0" />
              <span className="font-medium text-gray-900">
                {targetValid ? formatPKR(target) : '—'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {!targetValid
                ? 'Enter an amount to see the entry.'
                : difference === 0
                  ? 'No change — that is the balance already.'
                  : `Posts ${formatPKR(Math.abs(difference))} that ${
                      difference > 0 ? words.debit : words.credit
                    }.`}
            </p>
          </div>

          <div>
            <label htmlFor="adj-date" className="block text-sm font-medium text-gray-700 mb-1.5">
              Date of the correction
            </label>
            <input
              id="adj-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="adj-reason" className="block text-sm font-medium text-gray-700 mb-1.5">
              Why is it being changed?
            </label>
            <textarea
              id="adj-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cash payment of 3,000 taken on 12 Aug was never entered"
              className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              This is stored with the entry and shown on the statement, so write
              what would explain it a year from now.
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
              disabled={mutation.isPending || !canSubmit}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Posting…' : 'Post adjustment'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
