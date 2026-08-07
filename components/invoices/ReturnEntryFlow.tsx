'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { CustomerCombobox } from './CustomerCombobox';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';
import { useReturnableInvoices } from '@/lib/queries/return-form';
import { formatPKR } from '@/lib/money';

/**
 * Customer-first return entry: pick the customer, pick which of their
 * invoices the return is against (only invoices with something left to
 * return are listed), then continue into the existing per-invoice return
 * form — one flow, one implementation of the item/price logic.
 */
export function ReturnEntryFlow() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data: customers = [], isLoading: customersLoading } = useCustomersWithBalance();
  const { data: invoices = [], isLoading: invoicesLoading } = useReturnableInvoices(
    customerId ?? '',
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Step 1: customer */}
      <CustomerCombobox
        customers={customers}
        value={customerId}
        onChange={setCustomerId}
        loading={customersLoading}
      />

      {/* Step 2: invoice */}
      {customerId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Which invoice is the return against?
          </h2>
          {invoicesLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
              No returnable invoices — everything this customer bought has
              either been fully returned already or they have no invoices yet.
            </p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <button
                  key={inv.invoice_id}
                  type="button"
                  onClick={() => router.push(`/invoices/${inv.invoice_id}/return`)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-200 px-4 py-3.5 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors min-h-16"
                >
                  <span className="p-2 rounded-lg bg-gray-100 text-gray-500 shrink-0">
                    <RotateCcw size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-mono text-sm font-medium text-gray-900">
                      {inv.invoice_number}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {format(parseISO(inv.issue_date), 'dd MMM yyyy')} · {inv.item_count}{' '}
                      {inv.item_count === 1 ? 'item' : 'items'} · {inv.returnable_quantity} returnable
                    </span>
                  </span>
                  <span className="font-mono text-sm text-gray-700 shrink-0">
                    {formatPKR(inv.total_paisa)}
                  </span>
                  <ChevronRight size={15} className="text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
