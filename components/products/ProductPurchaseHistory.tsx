'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { History, Plus, Pencil } from 'lucide-react';
import { useStockPurchases } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';
import { AddPurchaseModal } from '@/components/suppliers/AddPurchaseModal';
import { CorrectRateModal } from '@/components/suppliers/CorrectRateModal';

type Props = {
  productId: string;
  /** Unit price column only renders for admin/accountant (iron rule #3). */
  canSeeMoney: boolean;
  /** purchases.create — shows the "Add Purchase" button. */
  canPurchase?: boolean;
  /** suppliers.create — lets that form add a supplier inline. */
  canCreateSupplier?: boolean;
  /** purchases.update — shows the pencil that corrects a recorded rate. */
  canCorrectRate?: boolean;
};

/**
 * Where this product was bought and at what price — every stock_purchase for
 * one product, newest first. The same product bought from Ali in June and
 * Waqas in July is two rows, each with its own date and price. Staff still see
 * date/supplier/qty; the money columns are NULL for them at the database level.
 */
export function ProductPurchaseHistory({
  productId,
  canSeeMoney,
  canPurchase = false,
  canCreateSupplier = false,
  canCorrectRate = false,
}: Props) {
  const { data: purchases = [], isLoading } = useStockPurchases(undefined, productId);
  const [addOpen, setAddOpen] = useState(false);
  /** The purchase whose rate is being corrected, if any. */
  const [correcting, setCorrecting] = useState<string | null>(null);
  const target = purchases.find((p) => p.id === correcting) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <History size={15} className="text-gray-400" />
          Purchase History
        </h2>
        {canPurchase && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
          >
            <Plus size={14} />
            Add Purchase
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">
          No supplier purchases recorded for this product yet.
          {canPurchase && ' Use Add Purchase to record who you bought it from, when, and at what price.'}
        </p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
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
                      <Link
                        href={`/suppliers/${p.supplier_id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {p.supplier_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.quantity} {p.product_unit}
                    </td>
                    {canSeeMoney && (
                      <>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            {p.unit_price_paisa === null ? '—' : formatPKR(p.unit_price_paisa)}
                            {canCorrectRate && p.unit_price_paisa !== null && (
                              <button
                                type="button"
                                onClick={() => setCorrecting(p.id)}
                                title="Change purchase rate"
                                aria-label={`Change purchase rate for ${p.supplier_name}`}
                                className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                          </span>
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
              <div
                key={p.id}
                className="flex items-center bg-white rounded-2xl border border-gray-200 pr-2"
              >
                <Link
                  href={`/suppliers/${p.supplier_id}`}
                  className="flex flex-1 items-center justify-between min-w-0 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{p.supplier_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {format(parseISO(p.purchase_date), 'dd MMM yyyy')} · {p.quantity}{' '}
                      {p.product_unit}
                    </p>
                  </div>
                  {canSeeMoney && p.unit_price_paisa !== null && (
                    <p className="text-sm font-mono text-gray-700 shrink-0 ml-3">
                      @ {formatPKR(p.unit_price_paisa)}
                    </p>
                  )}
                </Link>
                {canCorrectRate && p.unit_price_paisa !== null && (
                  <button
                    type="button"
                    onClick={() => setCorrecting(p.id)}
                    aria-label={`Change purchase rate for ${p.supplier_name}`}
                    className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {addOpen && (
        <AddPurchaseModal
          defaultProductId={productId}
          canCreateSupplier={canCreateSupplier}
          onClose={() => setAddOpen(false)}
        />
      )}

      {target && target.unit_price_paisa !== null && (
        <CorrectRateModal
          purchaseId={target.id}
          productName={target.product_name}
          supplierName={target.supplier_name}
          purchaseDate={format(parseISO(target.purchase_date), 'dd MMM yyyy')}
          quantity={target.quantity}
          unit={target.product_unit}
          currentRatePaisa={target.unit_price_paisa}
          onClose={() => setCorrecting(null)}
        />
      )}
    </div>
  );
}
