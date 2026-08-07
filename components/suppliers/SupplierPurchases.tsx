'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { useStockPurchases } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';
import { AddPurchaseModal } from './AddPurchaseModal';

type Props = {
  supplierId: string;
  canCreate: boolean;
  /** False for staff/viewer — the money columns come back NULL for them. */
  canSeeMoney: boolean;
};

export function SupplierPurchases({ supplierId, canCreate, canSeeMoney }: Props) {
  const { data: purchases = [], isLoading } = useStockPurchases(supplierId);
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={15} />
            Add Purchase
          </button>
        </div>
      )}

      {purchases.length === 0 ? (
        <p className="text-center py-10 text-sm text-gray-400">
          No purchases recorded from this supplier yet.
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qty</th>
                  {canSeeMoney && (
                    <>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Unit Price</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {format(parseISO(p.purchase_date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{p.product_name}</span>
                      {p.product_sku && (
                        <span className="ml-1.5 text-xs text-gray-400 font-mono">{p.product_sku}</span>
                      )}
                      {p.notes && <p className="text-xs text-gray-500 mt-0.5">{p.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.quantity} {p.product_unit}
                    </td>
                    {canSeeMoney && (
                      <>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          {p.unit_price_paisa === null ? '—' : formatPKR(p.unit_price_paisa)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium">
                          {p.total_paisa === null ? '—' : formatPKR(p.total_paisa)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {purchases.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{p.product_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {format(parseISO(p.purchase_date), 'dd MMM yyyy')} · {p.quantity}{' '}
                      {p.product_unit}
                    </p>
                  </div>
                  {canSeeMoney && (
                    <p className="text-sm font-mono font-medium shrink-0">
                      {p.total_paisa === null ? '—' : formatPKR(p.total_paisa)}
                    </p>
                  )}
                </div>
                {p.notes && <p className="text-xs text-gray-500 mt-1.5">{p.notes}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {modalOpen && (
        <AddPurchaseModal
          defaultSupplierId={supplierId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
    </div>
  );
}
