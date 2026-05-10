'use client';

import { useState } from 'react';
import { Pencil, BookOpen } from 'lucide-react';
import { CustomerForm } from './CustomerForm';
import { CustomerLedger } from './CustomerLedger';
import type { Customer } from '@/lib/queries/customers';

type Tab = 'details' | 'ledger';

type Props = {
  customer: Customer;
  businessName: string;
};

export function CustomerDetailTabs({ customer, businessName }: Props) {
  const [tab, setTab] = useState<Tab>('details');

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <TabButton active={tab === 'details'} onClick={() => setTab('details')} icon={<Pencil size={14} />}>
            Details
          </TabButton>
          <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')} icon={<BookOpen size={14} />}>
            Ledger
          </TabButton>
        </nav>
      </div>

      {tab === 'details' && <CustomerForm customer={customer} />}
      {tab === 'ledger' && (
        <CustomerLedger
          customerId={customer.id}
          customerName={customer.name}
          customerPhone={customer.phone}
          businessName={businessName}
        />
      )}
    </div>
  );
}

function TabButton({
  active, onClick, children, icon,
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
        'inline-flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors',
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
