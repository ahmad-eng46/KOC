'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Scale, ArrowRight, AlertTriangle } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { todayKarachiISO } from '@/lib/date';
import { useAdjustCustomerBalance } from '@/lib/queries/customers';
import { useAdjustSupplierBalance } from '@/lib/queries/suppliers';
import {
  describeAdjustment, reasonIsAdequate, describeDirection,
  adjustmentLooksLarge, isFutureDate,
  type BalanceField, type PartyType,
} from '@/lib/balance-adjustment';

type Props = {
  party: PartyType;
  partyId: string;
  partyName: string;
  /** Where the account stands now. */
  currentBalancePaisa: number;
  /** What it started at. Enables correcting the opening balance. */
  currentOpeningPaisa?: number;
  /**
   * The biggest single transaction on this account, used only to decide
   * whether a correction is worth querying. Zero means "no history", and
   * nothing is said.
   */
  largestTransactionPaisa?: number;
  onClose: () => void;
  onDone?: () => void;
};

/**
 * Correcting a balance, the only way the books allow it: by saying what the
 * balance should be and why.
 *
 * The admin types a target, not a difference. That is what they are actually
 * thinking — "he owes 12,000, not 15,000" — and it removes the one mistake a
 * delta invites, which is applying the same correction twice.
 *
 * Two stages, deliberately. The first collects; the second states what is
 * about to be posted in words — which balance, from what to what, and which
 * way the money moves — and only then offers the button that writes it.
 * Debit/credit confusion is the costly mistake in this dialog, and a sign on
 * a number is not enough to prevent it.
 *
 * Nothing here overwrites anything. The RPC posts a dated entry and writes its
 * own audit row in the same transaction (0080).
 */
export function AdjustBalanceModal({
  party, partyId, partyName,
  currentBalancePaisa, currentOpeningPaisa, largestTransactionPaisa = 0,
  onClose, onDone,
}: Props) {
  const today = todayKarachiISO();
  const canAdjustOpening = currentOpeningPaisa !== undefined;

  const [field, setField] = useState<BalanceField>('outstanding');
  const [targetText, setTargetText] = useState(
    formatPKR(currentBalancePaisa, { showSymbol: false }),
  );
  const [reason, setReason] = useState('');
  const [entryDate, setEntryDate] = useState(today);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerMutation = useAdjustCustomerBalance(partyId);
  const supplierMutation = useAdjustSupplierBalance(partyId);
  const mutation = party === 'customer' ? customerMutation : supplierMutation;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = field === 'opening' ? (currentOpeningPaisa ?? 0) : currentBalancePaisa;
  const { targetPaisa: target, differencePaisa: difference, valid: targetValid, postable } =
    describeAdjustment(current, targetText);

  const reasonValid = reasonIsAdequate(reason);
  const dateInFuture = isFutureDate(entryDate, today);
  const looksLarge = adjustmentLooksLarge(difference, largestTransactionPaisa);
  const canProceed = postable && reasonValid && !dateInFuture;

  // Switching which balance is being corrected re-seeds the figure, so the
  // field never shows the other balance's number.
  function switchField(next: BalanceField) {
    setField(next);
    setConfirming(false);
    const seed = next === 'opening' ? (currentOpeningPaisa ?? 0) : currentBalancePaisa;
    setTargetText(formatPKR(seed, { showSymbol: false }));
  }

  function review() {
    if (!targetValid) { setError('Enter a valid amount.'); return; }
    if (!postable) { setError('That is already the balance — nothing to change.'); return; }
    if (!reasonValid) { setError('Say why the balance is being changed.'); return; }
    if (dateInFuture) { setError('An adjustment cannot be dated in the future.'); return; }
    setError(null);
    setConfirming(true);
  }

  async function post() {
    setError(null);
    const result = await mutation.mutateAsync({
      targetBalancePaisa: target,
      reason: reason.trim(),
      entryDate,
      field,
    });

    if (!result.ok) { setError(result.error); setConfirming(false); return; }
    onDone?.();
    onClose();
  }

  if (typeof document === 'undefined') return null;

  const fieldLabel = field === 'opening' ? 'opening balance' : 'outstanding balance';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Scale size={16} className="text-blue-600" />
            {confirming ? 'Confirm this correction' : 'Adjust balance'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {confirming ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700">
              About to post a correction to {partyName}&apos;s {fieldLabel}.
            </p>

            <dl className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              <Line label="Balance now" value={formatPKR(current)} />
              <Line label="Will become" value={formatPKR(target)} strong />
              <Line
                label="Adjustment"
                value={`${difference > 0 ? '+' : '−'} ${formatPKR(Math.abs(difference), { showSymbol: false })}`}
              />
              <Line label="Effective" value={entryDate} />
            </dl>

            <div className="rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5">
              <p className="text-sm font-medium text-blue-900">
                {describeDirection(party, difference)}
              </p>
            </div>

            {looksLarge && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex gap-2">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900">
                  This is more than twice the largest transaction on this
                  account. Worth a second look — you can still post it.
                </p>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Reason</p>
              <p className="mt-0.5 text-sm text-gray-800 italic">&ldquo;{reason.trim()}&rdquo;</p>
            </div>

            <p className="text-xs text-gray-500">
              Once posted this cannot be edited or removed. A mistake is fixed
              by posting another correction.
            </p>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={mutation.isPending}
                className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={post}
                disabled={mutation.isPending}
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {mutation.isPending ? 'Posting…' : 'Post adjustment'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-gray-700">
              This posts a dated correction to {partyName}&apos;s ledger. Nothing
              already recorded is changed or removed.
            </p>

            {canAdjustOpening && (
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-1.5">
                  Which balance?
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <FieldButton
                    active={field === 'outstanding'}
                    onClick={() => switchField('outstanding')}
                    title="Outstanding"
                    subtitle="Where it stands now"
                  />
                  <FieldButton
                    active={field === 'opening'}
                    onClick={() => switchField('opening')}
                    title="Opening"
                    subtitle="What it started at"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="adj-target" className="block text-sm font-medium text-gray-700 mb-1.5">
                What should the {fieldLabel} be? (Rs.)
              </label>
              <input
                id="adj-target"
                inputMode="decimal"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                <span className="text-gray-500">{formatPKR(current)}</span>
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
                    : describeDirection(party, difference)}
              </p>
            </div>

            <div>
              <label htmlFor="adj-date" className="block text-sm font-medium text-gray-700 mb-1.5">
                Effective date
              </label>
              <input
                id="adj-date"
                type="date"
                max={today}
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {dateInFuture && (
                <p className="mt-1 text-xs text-red-600">
                  An adjustment cannot be dated in the future.
                </p>
              )}
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
                Stored with the entry and shown on the statement, so write what
                would explain it a year from now.
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
                className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={review}
                disabled={!canProceed}
                className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Review
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={['text-sm tabular-nums', strong ? 'font-semibold text-gray-900' : 'text-gray-800'].join(' ')}>
        {value}
      </dd>
    </div>
  );
}

function FieldButton({
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-auto py-2 px-3 rounded-xl border text-left transition-colors',
        active ? 'border-blue-600 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50',
      ].join(' ')}
    >
      <span className={['block text-sm font-medium', active ? 'text-blue-800' : 'text-gray-800'].join(' ')}>
        {title}
      </span>
      <span className="block text-[11px] text-gray-500">{subtitle}</span>
    </button>
  );
}
