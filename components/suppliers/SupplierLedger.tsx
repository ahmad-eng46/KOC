'use client';

import { format, parseISO } from 'date-fns';
import { useSupplierLedger } from '@/lib/queries/suppliers';
import { formatPKR } from '@/lib/money';

type Props = {
  supplierId: string;
  /** The ledger RPC refuses staff/viewer; don't even fetch for them. */
  canSeeMoney: boolean;
};

/**
 * Combined chronological purchases/payments view with a running balance,
 * mirroring CustomerLedger. Balance comes from the supplier_ledger() window
 * function — never summed here.
 *
 * Sign: positive running balance = we owe the supplier.
 */
export function SupplierLedger({ supplierId, canSeeMoney }: Props) {
  const { data: rows = [], isLoading } = useSupplierLedger(supplierId, canSeeMoney);

  if (!canSeeMoney) {
    return (
      <p className="text-center py-10 text-sm text-gray-400">
        The supplier ledger shows purchase amounts, which are not visible for your role.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-center py-10 text-sm text-gray-400">
        No activity with this supplier yet.
      </p>
    );
  }

  const closing = rows[rows.length - 1].running_balance;

  return (
    <div className="space-y-3">
      {/* Desktop */}
      <div className="hidden md:block bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Purchase</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Paid</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {format(parseISO(r.entry_date), 'dd MMM yyyy')}
                </td>
                <td className="px-4 py-3 text-gray-700">{r.description}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.debit_paisa > 0 ? formatPKR(r.debit_paisa) : ''}
                </td>
                <td className="px-4 py-3 text-right font-mono text-green-700">
                  {r.credit_paisa > 0 ? formatPKR(r.credit_paisa) : ''}
                </td>
                <td
                  className={[
                    'px-4 py-3 text-right font-mono font-medium',
                    r.running_balance > 0
                      ? 'text-red-600'
                      : r.running_balance < 0
                        ? 'text-green-600'
                        : 'text-gray-500',
                  ].join(' ')}
                >
                  {formatPKR(r.running_balance)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200">
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right font-medium text-gray-700">
                {closing > 0 ? 'We owe' : closing < 0 ? 'In credit' : 'Settled'}
              </td>
              <td
                className={[
                  'px-4 py-3 text-right font-mono font-bold',
                  closing > 0 ? 'text-red-600' : closing < 0 ? 'text-green-600' : 'text-gray-700',
                ].join(' ')}
              >
                {formatPKR(Math.abs(closing))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-900">{r.description}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(parseISO(r.entry_date), 'dd MMM yyyy')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={[
                    'text-sm font-mono font-medium',
                    r.debit_paisa > 0 ? 'text-red-600' : 'text-green-600',
                  ].join(' ')}
                >
                  {r.debit_paisa > 0
                    ? `+ ${formatPKR(r.debit_paisa)}`
                    : `− ${formatPKR(r.credit_paisa)}`}
                </p>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  bal {formatPKR(r.running_balance)}
                </p>
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between bg-gray-100 rounded-2xl px-4 py-3">
          <span className="text-sm font-medium text-gray-700">
            {closing > 0 ? 'We owe' : closing < 0 ? 'In credit' : 'Settled'}
          </span>
          <span
            className={[
              'text-sm font-mono font-bold',
              closing > 0 ? 'text-red-600' : closing < 0 ? 'text-green-600' : 'text-gray-700',
            ].join(' ')}
          >
            {formatPKR(Math.abs(closing))}
          </span>
        </div>
      </div>
    </div>
  );
}
