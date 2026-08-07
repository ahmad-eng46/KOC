'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  useProductStockHistory,
  type StockMovementType,
} from '@/lib/queries/stock-history';

type Props = { productId: string; unit: string };

const TYPE_META: Record<
  StockMovementType,
  { label: string; sign: 1 | -1; badge: string; Icon: typeof RotateCcw }
> = {
  in: {
    label: 'Stock In',
    sign: 1,
    badge: 'bg-green-50 text-green-700 border-green-200',
    Icon: ArrowDownToLine,
  },
  out: {
    label: 'Sale',
    sign: -1,
    badge: 'bg-gray-100 text-gray-600 border-gray-200',
    Icon: ArrowUpFromLine,
  },
  return: {
    label: 'Return (stock in)',
    sign: 1,
    badge: 'bg-green-50 text-green-700 border-green-200',
    Icon: RotateCcw,
  },
  adjustment: {
    label: 'Adjustment',
    sign: 1,
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: SlidersHorizontal,
  },
};

function reference(m: { invoice_id: string | null; invoice_number: string | null; note: string | null }) {
  if (m.invoice_id && m.invoice_number) {
    return (
      <Link href={`/invoices/${m.invoice_id}`} className="font-mono hover:text-blue-600">
        {m.invoice_number}
      </Link>
    );
  }
  return <span className="text-gray-500">{m.note ?? '—'}</span>;
}

/**
 * Movement history for one product — sales out, purchases and returns back
 * in. Returns show as stock-in with their RET number so a refund is
 * traceable end to end (invoice → return → shelf).
 */
export function ProductStockHistory({ productId, unit }: Props) {
  const { data: movements = [], isLoading } = useProductStockHistory(productId);

  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <ArrowDownToLine size={15} className="text-gray-400" />
        Stock History
      </h2>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : movements.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No stock movements for this product yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {movements.map((m) => {
            const meta = TYPE_META[m.type];
            const qty = meta.sign * m.quantity;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 min-h-14">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 ${meta.badge}`}
                >
                  <meta.Icon size={11} />
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0 text-xs text-gray-500">
                  <span className="block truncate">
                    {m.return_number ? (
                      <span className="font-mono text-gray-700">{m.return_number}</span>
                    ) : (
                      reference(m)
                    )}
                  </span>
                  <span className="block mt-0.5">
                    {format(parseISO(m.created_at), 'dd MMM yyyy, h:mm a')}
                  </span>
                </div>
                <span
                  className={`font-mono text-sm tabular-nums shrink-0 ${
                    qty >= 0 ? 'text-green-700' : 'text-gray-700'
                  }`}
                >
                  {qty >= 0 ? '+' : ''}
                  {qty} {unit}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
