'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { useStockPurchases } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';

type Props = {
  productId: string;
  /** Unit price column only renders for admin/accountant (iron rule #3). */
  canSeeMoney: boolean;
};

/**
 * Where this product was bought and at what price — every stock_purchase for
 * one product, newest first. Staff still see date/supplier/qty; the money
 * columns are NULL for them at the database level.
 */
export function ProductPurchaseHistory({ productId, canSeeMoney }: Props) {
  const { data: purchases = [], isLoading } = useStockPurchases(undefined, productId);

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <History size={15} className="text-gray-400" />
        Purchase History
      </h2>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : purchases.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">
          No supplier purchases recorded for this product yet.
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
              <Link
                key={p.id}
                href={`/suppliers/${p.supplier_id}`}
                className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3"
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
