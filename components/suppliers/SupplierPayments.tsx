'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { useSupplierPayments } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';
import { PAYMENT_METHOD_LABELS } from '@/lib/validators/suppliers';
import { AddPaymentModal } from './AddPaymentModal';

type Props = {
  supplierId: string;
  canCreate: boolean;
};

export function SupplierPayments({ supplierId, canCreate }: Props) {
  const { data: payments = [], isLoading } = useSupplierPayments(supplierId);
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} />
            Add Payment
          </button>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          No payments made to this supplier yet.
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {p.reference ?? '—'}
                      {p.notes && <p className="text-xs text-gray-500 mt-0.5 font-sans">{p.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-green-700">
                      {formatPKR(p.amount_paisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">
                      {p.payment_method ? PAYMENT_METHOD_LABELS[p.payment_method] : 'Payment'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {format(parseISO(p.payment_date), 'dd MMM yyyy')}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-mono font-medium text-green-700 shrink-0">
                    {formatPKR(p.amount_paisa)}
                  </p>
                </div>
                {p.notes && <p className="text-xs text-gray-500 mt-1.5">{p.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <AddPaymentModal defaultSupplierId={supplierId} onClose={() => setModalOpen(false)} />
      )}
    </div>
  );
}
