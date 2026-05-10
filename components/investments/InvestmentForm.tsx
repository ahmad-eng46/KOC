'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { useBusinessStore } from '@/lib/store/business';
import { rupeesToPaisa } from '@/lib/money';
import { createInvestment } from '@/lib/actions/investment';

function todayISO() { return format(new Date(), 'yyyy-MM-dd'); }

export function InvestmentForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  const [investorName, setInvestorName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [investmentDate, setInvestmentDate] = useState(todayISO());
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const amountPaisa = useMemo(() => {
    const n = parseFloat(amountInput);
    if (isNaN(n) || n <= 0) return 0;
    return rupeesToPaisa(n);
  }, [amountInput]);

  const validationError = !investorName.trim()
    ? 'Source / investor name is required'
    : amountPaisa <= 0
      ? 'Enter an amount > 0'
      : !investmentDate
        ? 'Pick a date'
        : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError) return;
    setServerError(null);
    setSubmitting(true);

    const r = await createInvestment({
      investor_name: investorName.trim(),
      amount_paisa: amountPaisa,
      investment_date: investmentDate,
      notes: notes.trim() || undefined,
    });

    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['investments', activeId] });
    router.push('/investments');
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Source / Investor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={investorName}
          onChange={(e) => setInvestorName(e.target.value)}
          placeholder="e.g. Khaliq Ahmed (owner), Bank loan, etc."
          className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

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
            value={investmentDate}
            onChange={(e) => setInvestmentDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

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
              Save Investment
            </>
          )}
        </button>
      </div>
    </form>
  );
}
