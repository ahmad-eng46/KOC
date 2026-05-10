'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useReturnFormData } from '@/lib/queries/return-form';
import { useBusinessStore } from '@/lib/store/business';
import { formatPKR } from '@/lib/money';
import { createReturn } from '@/lib/actions/return';

type Props = { invoiceId: string };

type ItemSelection = {
  selected: boolean;
  qty: number;
};

export function ReturnForm({ invoiceId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);
  const { data, isLoading, error } = useReturnFormData(invoiceId);

  const [selections, setSelections] = useState<Record<string, ItemSelection>>({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const totalReturnPaisa = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    for (const it of data.items) {
      const sel = selections[it.invoice_item_id];
      if (!sel?.selected || !sel.qty) continue;
      total += Math.round(sel.qty * it.unit_price_paisa);
    }
    return total;
  }, [data, selections]);

  const validationError: string | null = useMemo(() => {
    if (!data) return null;
    const picked = data.items.filter((it) => selections[it.invoice_item_id]?.selected);
    if (picked.length === 0) return 'Select at least one item to return';
    for (const it of picked) {
      const sel = selections[it.invoice_item_id]!;
      if (sel.qty <= 0) return `Quantity must be > 0 for ${it.product_name}`;
      if (sel.qty > it.remaining) {
        return `${it.product_name}: cannot return more than ${it.remaining} (sold ${it.sold_quantity}, already returned ${it.already_returned})`;
      }
    }
    if (!reason.trim()) return 'Reason is required';
    return null;
  }, [data, selections, reason]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">Could not load invoice.</p>
      </div>
    );
  }

  const allReturned = data.items.every((it) => it.remaining <= 0);

  function toggle(itemId: string, item: { remaining: number }) {
    setSelections((prev) => {
      const cur = prev[itemId];
      if (cur?.selected) {
        return { ...prev, [itemId]: { selected: false, qty: 0 } };
      }
      return { ...prev, [itemId]: { selected: true, qty: item.remaining } };
    });
  }

  function setQty(itemId: string, value: string) {
    const n = parseFloat(value);
    setSelections((prev) => ({
      ...prev,
      [itemId]: { selected: true, qty: isNaN(n) ? 0 : n },
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validationError || !data) return;
    setSubmitting(true);
    setServerError(null);

    const items = data.items
      .filter((it) => selections[it.invoice_item_id]?.selected)
      .map((it) => ({
        invoice_item_id: it.invoice_item_id,
        quantity: selections[it.invoice_item_id]!.qty,
      }));

    const r = await createReturn({
      invoice_id: invoiceId,
      reason: reason.trim(),
      items,
    });

    if (!r.ok) {
      setServerError(r.error);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ['invoice-detail', activeId, invoiceId] });
    await queryClient.invalidateQueries({ queryKey: ['invoices', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['products', activeId] });
    await queryClient.invalidateQueries({ queryKey: ['customers-with-balance', activeId] });

    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  }

  return (
    <form className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">Return for</p>
        <p className="text-sm font-mono font-medium text-gray-900 mt-0.5">
          {data.invoice_number}
        </p>
        <p className="text-sm text-gray-700 mt-0.5">{data.customer_name}</p>
      </div>

      {allReturned && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            All items on this invoice have already been fully returned.
          </p>
        </div>
      )}

      {/* Items */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Items</h2>
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {data.items.map((it) => {
            const sel = selections[it.invoice_item_id];
            const isFullyReturned = it.remaining <= 0;
            return (
              <div key={it.invoice_item_id} className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={sel?.selected ?? false}
                    onChange={() => toggle(it.invoice_item_id, it)}
                    disabled={isFullyReturned}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{it.product_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {it.sku ? `${it.sku} · ` : ''}
                      Sold: {it.sold_quantity} {it.unit} · Already returned: {it.already_returned} ·{' '}
                      <span className={isFullyReturned ? 'text-gray-400' : 'text-green-600 font-medium'}>
                        Remaining: {it.remaining}
                      </span>
                      {' · '}
                      <span className="font-mono">{formatPKR(it.unit_price_paisa)}</span>
                    </p>

                    {sel?.selected && !isFullyReturned && (
                      <div className="mt-2 grid grid-cols-2 gap-3 max-w-sm">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            Return Qty
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={sel.qty}
                            onChange={(e) => setQty(it.invoice_item_id, e.target.value)}
                            className={[
                              'w-full h-9 px-3 rounded-lg border text-sm bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500',
                              sel.qty > it.remaining ? 'border-red-400' : 'border-gray-300',
                            ].join(' ')}
                          />
                          {sel.qty > it.remaining && (
                            <p className="text-xs text-red-600 mt-0.5">Max {it.remaining}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            Refund
                          </label>
                          <div className="h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-mono tabular-nums flex items-center justify-end">
                            {formatPKR(Math.round(sel.qty * it.unit_price_paisa))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Reason <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Defective item, wrong product delivered, customer changed mind"
          rows={3}
          className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Total */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Total Refund</span>
          <span className="text-lg font-mono font-semibold text-gray-900 tabular-nums">
            {formatPKR(totalReturnPaisa)}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Customer's balance will be reduced by this amount; stock will be restored.
        </p>
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
          disabled={!!validationError || submitting || allReturned}
          title={validationError ?? undefined}
          className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
        >
          <RotateCcw size={15} />
          {submitting ? 'Processing…' : 'Process Return'}
        </button>
      </div>
    </form>
  );
}
