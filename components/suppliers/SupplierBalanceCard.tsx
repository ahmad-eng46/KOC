'use client';

import { formatPKR } from '@/lib/money';
import { computeSupplierAccount } from '@/lib/supplier-totals';
import type { SupplierBalance } from '@/lib/queries/suppliers';

/**
 * Total Purchased | Total Paid | Balance.
 *
 * Money is null for staff/viewer (the DB view NULLs it), so those roles see a
 * "hidden" note instead of zeros that would read as "nothing owed".
 */
export function SupplierBalanceCard({ balance }: { balance: SupplierBalance | null }) {
  const account = computeSupplierAccount({
    totalPurchasedPaisa: balance?.total_purchased_paisa ?? null,
    totalPaidPaisa: balance?.total_paid_paisa ?? null,
  });

  if (!account) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-sm text-gray-500">
          Purchase amounts are not visible for your role.
        </p>
      </div>
    );
  }

  const { totalPurchasedPaisa, totalPaidPaisa, balanceDuePaisa, weOwe, inCredit } = account;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 sm:divide-y-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 sm:divide-x divide-gray-100">
        <Stat label="Total Purchased" value={formatPKR(totalPurchasedPaisa)} />
        <Stat label="Total Paid" value={formatPKR(totalPaidPaisa)} />
        <div className="col-span-2 sm:col-span-1 px-4 py-3.5 border-t sm:border-t-0 border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            {weOwe ? 'We Owe' : inCredit ? 'In Credit' : 'Balance'}
          </p>
          <p
            className={[
              'mt-1 text-2xl font-bold font-mono',
              weOwe ? 'text-red-600' : inCredit ? 'text-green-600' : 'text-gray-900',
            ].join(' ')}
          >
            {formatPKR(Math.abs(balanceDuePaisa))}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {weOwe
              ? 'Outstanding to this supplier'
              : inCredit
                ? 'We paid more than we bought'
                : 'Account settled'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900 font-mono">{value}</p>
    </div>
  );
}
