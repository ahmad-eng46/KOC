'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { useBusinessStore } from '@/lib/store/business';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';
import { rupeesToPaisa } from '@/lib/money';
import { createLoan } from '@/lib/actions/loan';
import { loanDirections, type LoanDirection } from '@/lib/validators/loan';
import { CustomerCombobox } from '@/components/invoices/CustomerCombobox';

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }

const DIRECTION_LABEL: Record<LoanDirection, string> = {
  given: 'Given (we lent out)',
  taken: 'Taken (we borrowed)',
};

export function LoanForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  const { data: customers = [] } = useCustomersWithBalance();

  const [direction, setDirection] = useState<LoanDirection>('given');
  const [partyMode, setPartyMode] = useState<'customer' | 'free'>('customer');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [loanDate, setLoanDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const amountPaisa = useMemo(() => {
    const n = parseFloat(amountInput);
    if (isNaN(n) || n <= 0) return 0;
    return rupeesToPaisa(n);
  }, [amountInput]);

  const resolvedPartyName =
    partyMode === 'customer'
      ? (customers.find((c) => c.id === customerId)?.name ?? '')
      : partyName.trim();

  const validationError = !resolvedPartyName
    ? 'Pick a customer or enter party name'
    : amountPaisa <= 0
      ? 'Enter an amount > 0'
      : !loanDate
        ? 'Pick a date'
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    setServerError(null);
    setSubmitting(true);

    const r = await createLoan({
      direction,
      party_name: resolvedPartyName,
      party_customer_id: partyMode === 'customer' ? customerId : null,
      principal_paisa: amountPaisa,
      loan_date: loanDate,
      due_date: dueDate || undefined,
      notes: notes.trim() || undefined,
    });

    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['loans', activeId] });
    router.push('/loans');
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {/* Direction */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Loan Direction <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {loanDirections.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={[
                'h-11 rounded-xl border text-sm font-medium transition-colors',
                direction === d
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              ].join(' ')}
            >
              {DIRECTION_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Party */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Party <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setPartyMode('customer')}
            className={[
              'flex-1 h-9 rounded-lg border text-sm font-medium',
              partyMode === 'customer'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            Existing customer
          </button>
          <button
            type="button"
            onClick={() => setPartyMode('free')}
            className={[
              'flex-1 h-9 rounded-lg border text-sm font-medium',
              partyMode === 'free'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            Other (free text)
          </button>
        </div>
        {partyMode === 'customer' ? (
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={setCustomerId}
          />
        ) : (
          <input
            type="text"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="e.g. Brother, Bank XYZ, etc."
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      {/* Amount + dates */}
      <div className="grid sm:grid-cols-3 gap-4">
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
            Loan Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={loanDate}
            onChange={(e) => setLoanDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Note</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={15} />
              Save Loan
            </>
          )}
        </button>
      </div>
    </form>
  );
}
