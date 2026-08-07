'use client';

import { useState } from 'react';
import { ShoppingCart, CreditCard, BookOpen, Pencil } from 'lucide-react';
import { SupplierForm } from './SupplierForm';
import { SupplierPurchases } from './SupplierPurchases';
import { SupplierPayments } from './SupplierPayments';
import { SupplierLedger } from './SupplierLedger';
import type { Supplier } from '@/lib/queries/suppliers';

type Tab = 'purchases' | 'payments' | 'ledger' | 'details';

type Props = {
  supplier: Supplier;
  canEdit: boolean;
  canCreatePurchase: boolean;
  canCreatePayment: boolean;
  canSeeMoney: boolean;
};

export function SupplierDetailTabs({
  supplier,
  canEdit,
  canCreatePurchase,
  canCreatePayment,
  canSeeMoney,
}: Props) {
  const [tab, setTab] = useState<Tab>('purchases');

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex gap-6 min-w-max">
          <TabButton
            active={tab === 'purchases'}
            onClick={() => setTab('purchases')}
            icon={<ShoppingCart size={14} />}
          >
            Purchases
          </TabButton>
          {/* Payments tab is money-out; staff/viewer cannot even read the table */}
          {canSeeMoney && (
            <TabButton
              active={tab === 'payments'}
              onClick={() => setTab('payments')}
              icon={<CreditCard size={14} />}
            >
              Payments
            </TabButton>
          )}
          {canSeeMoney && (
            <TabButton
              active={tab === 'ledger'}
              onClick={() => setTab('ledger')}
              icon={<BookOpen size={14} />}
            >
              Ledger
            </TabButton>
          )}
          <TabButton
            active={tab === 'details'}
            onClick={() => setTab('details')}
            icon={<Pencil size={14} />}
          >
            Details
          </TabButton>
        </nav>
      </div>

      {tab === 'purchases' && (
        <SupplierPurchases
          supplierId={supplier.id}
          canCreate={canCreatePurchase}
          canSeeMoney={canSeeMoney}
        />
      )}
      {tab === 'payments' && canSeeMoney && (
        <SupplierPayments supplierId={supplier.id} canCreate={canCreatePayment} />
      )}
      {tab === 'ledger' && canSeeMoney && (
        <SupplierLedger supplierId={supplier.id} canSeeMoney={canSeeMoney} />
      )}
      {tab === 'details' && <SupplierForm supplier={supplier} canEdit={canEdit} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
