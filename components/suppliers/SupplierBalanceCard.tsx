'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { formatPKR } from '@/lib/money';
import { AdjustBalanceModal } from '@/components/balances/AdjustBalanceModal';
import { useSupplierLedger } from '@/lib/queries/suppliers';
import { computeSupplierAccount } from '@/lib/supplier-totals';
import type { SupplierBalance } from '@/lib/queries/suppliers';

/**
 * Total Purchased | Total Paid | Balance.
 *
 * Money is null for staff/viewer (the DB view NULLs it), so those roles see a
 * "hidden" note instead of zeros that would read as "nothing owed".
 */
export function SupplierBalanceCard({
  balance,
  supplierId,
  supplierName,
  canAdjustBalance = false,
}: {
  balance: SupplierBalance | null;
  supplierId: string;
  supplierName: string;
  /** Admin only. Enforced again in the action and in the RPC. */
  canAdjustBalance?: boolean;
}) {
  const [adjusting, setAdjusting] = useState(false);

  // Only for the dialog: what the account opened at, and its biggest single
  // movement — the yardstick for flagging an unusually large correction. The
  // card itself needs neither, so this is fetched only where it can be used.
  const { data: ledgerRows = [] } = useSupplierLedger(supplierId, canAdjustBalance);
  const openingPaisa = ledgerRows
    .filter((r) => r.ref_type === 'opening')
    .reduce((sum, r) => sum + r.debit_paisa - r.credit_paisa, 0);
  const largestTransaction = ledgerRows.reduce(
    (max, r) => Math.max(max, r.debit_paisa, r.credit_paisa),
    0,
  );

  const account = computeSupplierAccount({
    totalPurchasedPaisa: balance?.total_purchased_paisa ?? null,
    totalPaidPaisa: balance?.total_paid_paisa ?? null,
    balanceDuePaisa: balance?.balance_due_paisa ?? null,
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
      {adjusting && (
        <AdjustBalanceModal
          party="supplier"
          partyId={supplierId}
          partyName={supplierName}
          currentBalancePaisa={balanceDuePaisa}
          currentOpeningPaisa={openingPaisa}
          largestTransactionPaisa={largestTransaction}
          onClose={() => setAdjusting(false)}
        />
      )}

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

          {canAdjustBalance && (
            <button
              type="button"
              onClick={() => setAdjusting(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Scale size={13} /> Adjust Balance
            </button>
          )}
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
