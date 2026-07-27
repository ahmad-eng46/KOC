'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { todayKarachiISO } from '@/lib/date';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { createPayment } from '@/lib/actions/payment';
import { paymentMethods, type PaymentMethod } from '@/lib/validators/payment';
import { CustomerCombobox } from '@/components/invoices/CustomerCombobox';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  online: 'Online',
};

export function PaymentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  const { data: customers = [], isLoading: customersLoading } = useCustomersWithBalance();
  const presetCustomerId = params.get('customer');

  const [customerId, setCustomerId] = useState<string | null>(presetCustomerId ?? null);
  const [amountInput, setAmountInput] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayKarachiISO());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const amountPaisa = useMemo(() => {
    const n = parseFloat(amountInput);
    if (isNaN(n) || n <= 0) return 0;
    return rupeesToPaisa(n);
  }, [amountInput]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const previousBalance = selectedCustomer?.current_balance_paisa ?? 0;
  const newBalance = previousBalance - amountPaisa;

  const validationError =
    !customerId
      ? 'Select a customer'
      : amountPaisa <= 0
        ? 'Enter a positive amount'
        : !paymentDate
          ? 'Pick a date'
          : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    setServerError(null);
    setSubmitting(true);

    const r = await createPayment({
      customer_id: customerId!,
      amount_paisa: amountPaisa,
      payment_date: paymentDate,
      method,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      invoice_id: null,
    });

    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['payments', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['customers-with-balance', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['customer-ledger', activeId, customerId] });

    router.push('/payments');
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {/* Customer */}
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
              previousBalance > 0
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
                    previousBalance > 0 ? 'text-red-600' : 'text-gray-700',
                  ].join(' ')}
                >
                  {formatPKR(previousBalance)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Amount + Date */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Amount (Rs.) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Method */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Method <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {paymentMethods.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={[
                'h-10 rounded-xl border text-sm font-medium transition-colors',
                method === m
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Reference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Reference {method === 'cheque' ? '(Cheque No.)' : method !== 'cash' ? '(Transaction ID)' : ''}
        </label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={
            method === 'cheque'
              ? 'e.g. CHQ-1042'
              : method === 'bank_transfer'
                ? 'e.g. TXN-2026-0045'
                : 'Optional'
          }
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* New balance preview */}
      {selectedCustomer && amountPaisa > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">New Balance after Payment</span>
            <span
              className={[
                'text-lg font-mono font-semibold tabular-nums',
                newBalance > 0
                  ? 'text-red-600'
                  : newBalance < 0
                    ? 'text-green-600'
                    : 'text-gray-700',
              ].join(' ')}
            >
              {newBalance < 0 ? `${formatPKR(Math.abs(newBalance))} (Cr)` : formatPKR(newBalance)}
            </span>
          </div>
        </div>
      )}

      {/* Server error */}
      {serverError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

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
          disabled={!!validationError || submitting}
          title={validationError ?? undefined}
          className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Recording…
            </>
          ) : (
            <>
              <CheckCircle2 size={15} />
              Record Payment
            </>
          )}
        </button>
      </div>
    </form>
  );
}
