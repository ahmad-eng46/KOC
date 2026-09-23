'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { History, Plus, Pencil, Clock } from 'lucide-react';
import { useStockPurchases } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';
import { AddPurchaseModal } from '@/components/suppliers/AddPurchaseModal';
import { CorrectRateModal } from '@/components/suppliers/CorrectRateModal';
import { RequestRateChangeModal } from '@/components/suppliers/RequestRateChangeModal';
import { usePendingEntityIds } from '@/lib/queries/deletion-requests';

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
  /**
   * False for a non-admin. They get the same pencil, but it files a request
   * rather than writing — staff hold no UPDATE on stock_purchases, so the two
   * paths are genuinely different and not a UI preference.
   */
  isAdmin?: boolean;
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
  isAdmin = false,
}: Props) {
  const { data: purchases = [], isLoading } = useStockPurchases(undefined, productId);
  const [addOpen, setAddOpen] = useState(false);
  /** The purchase whose rate is being corrected, if any. */
  const [correcting, setCorrecting] = useState<string | null>(null);
  const target = purchases.find((p) => p.id === correcting) ?? null;

  /**
   * Which purchases already have a change waiting on an admin. Drives the
   * indicator, and stops a second request being started only to be refused by
   * the unique index (0072).
   */
  const { data: pendingIds = {} } = usePendingEntityIds('stock_purchase');

  // Everyone who may ask gets the pencil; what it opens is what differs.
  const mayAsk = canCorrectRate || !isAdmin;

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
                  {mayAsk && <th className="w-12 px-2 py-3" />}
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
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium">
                          {p.total_paisa === null ? '—' : formatPKR(p.total_paisa)}
                        </td>
                      </>
                    )}
                    {/*
                      Its own column, not tucked inside the price cell as it
                      was: that put it behind canSeeMoney, so the one role the
                      request flow exists for — staff, who cannot see a cost
                      price — never got the button at all.
                    */}
                    {mayAsk && (
                      <td className="px-2 py-3 text-right">
                        {pendingIds[p.id] ? (
                          <span
                            title={`A change is already waiting for approval — asked by ${pendingIds[p.id].requester}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-700"
                          >
                            <Clock size={11} /> Pending
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCorrecting(p.id)}
                            title={isAdmin ? 'Change this purchase' : 'Request a change'}
                            aria-label={`${isAdmin ? 'Change' : 'Request a change to'} the purchase from ${p.supplier_name}`}
                            className="p-1 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                      </td>
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
                {mayAsk && (
                  pendingIds[p.id] ? (
                    <span
                      aria-label="A change is already waiting for approval"
                      className="w-11 h-11 flex items-center justify-center text-amber-600 shrink-0"
                    >
                      <Clock size={15} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCorrecting(p.id)}
                      aria-label={`${isAdmin ? 'Change' : 'Request a change to'} the purchase from ${p.supplier_name}`}
                      className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 shrink-0"
                    >
                      <Pencil size={15} />
                    </button>
                  )
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

      {/*
        No unit_price_paisa check here: it is ALWAYS null for staff, so that
        condition kept the request dialog shut for exactly the people it was
        written for. The dialog handles a null rate by not offering the field.
      */}
      {target && !isAdmin && (
        <RequestRateChangeModal
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

      {target && target.unit_price_paisa !== null && isAdmin && (
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
