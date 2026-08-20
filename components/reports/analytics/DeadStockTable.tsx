'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { formatStock } from '@/lib/pack';
import { useDeadStock } from '@/lib/queries/sales-analytics';
import { formatQty } from './OverviewCards';

const WINDOWS = [30, 60, 90] as const;

export function DeadStockTable({ canSeeCost }: { canSeeCost: boolean }) {
  const [days, setDays] = useState<number>(30);
  const { data = [], isLoading, error } = useDeadStock(days);

  const tiedUp = data.reduce((sum, r) => sum + r.stockValuePaisa, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700">
          {error instanceof Error ? error.message : 'Could not load dead stock.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">No sales in:</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setDays(w)}
            className={[
              'px-3 h-9 text-xs font-medium rounded-full border',
              days === w
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            {w} days
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">
          Nothing is sitting still — every product holding stock has sold in the last {days} days.
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{formatPKR(tiedUp)}</span> of stock across{' '}
              {data.length} product{data.length === 1 ? '' : 's'} has not sold in {days} days.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Product</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Brand</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Stock</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Stock Value</th>
                    {canSeeCost && (
                      <th className="text-right px-3 py-3 font-medium text-gray-600">Cost Value</th>
                    )}
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Last Sale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((r) => (
                    <tr key={r.product_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 block">{r.product_name}</span>
                        {r.product_sku && <span className="text-xs text-gray-400">{r.product_sku}</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">{r.brand_name ?? '—'}</td>
                      <td className="px-3 py-3 text-right">
                        <span className="block font-mono text-sm tabular-nums text-gray-900">
                          {formatQty(r.stock_on_hand)}
                        </span>
                        <span className="block text-xs text-gray-400">
                          {formatStock(r.stock_on_hand, {
                            unit: r.product_unit ?? '',
                            pack_size: r.pack_size,
                            pack_name: r.pack_name,
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-900">
                        {formatPKR(r.stockValuePaisa)}
                      </td>
                      {canSeeCost && (
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-gray-600">
                          {r.stockCostValuePaisa === null ? '—' : formatPKR(r.stockCostValuePaisa)}
                        </td>
                      )}
                      <td className="px-3 py-3 text-right">
                        {r.neverSold ? (
                          <span className="text-xs font-medium text-red-600">Never sold</span>
                        ) : (
                          <span className="text-xs text-gray-600 tabular-nums">
                            {r.days_since_last_sale} days ago
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Sorted by the money standing still, not by how long it has been standing.
            Stock value is stock × sale price{canSeeCost ? '; cost value is stock × purchase price' : ''}.
          </p>
        </>
      )}
    </div>
  );
}
