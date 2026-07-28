'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { BookOpen } from 'lucide-react';
import { CustomerCombobox } from '@/components/invoices/CustomerCombobox';
import { CustomerLedger } from '@/components/customers/CustomerLedger';
import { useCustomersWithBalance } from '@/lib/queries/customers-balance';

type Props = {
  businessName: string;
};

// Earlier than any record the business can hold, so the range opens on
// everything and the user narrows from there.
const FULL_HISTORY_FROM = '2000-01-01';

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function LedgerBrowser({ businessName }: Props) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data: customers = [], isLoading, error } = useCustomersWithBalance();

  const selected = customers.find((c) => c.id === customerId) ?? null;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <CustomerCombobox
          customers={customers}
          value={customerId}
          onChange={setCustomerId}
          loading={isLoading}
          error={error ? 'Could not load customers.' : undefined}
        />
      </div>

      {selected ? (
        <CustomerLedger
          key={selected.id}
          customerId={selected.id}
          customerName={selected.name}
          customerPhone={selected.phone}
          businessName={businessName}
          // The customer tab opens on the current month; this page is for
          // looking up history, so it opens on the full record instead.
          initialFrom={FULL_HISTORY_FROM}
          initialTo={todayISO()}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 py-16 px-4 text-center">
          <div className="inline-flex p-3 rounded-2xl bg-gray-50 mb-3">
            <BookOpen size={22} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-900">Choose a customer</p>
          <p className="text-sm text-gray-500 mt-1">
            Their statement, running balance and printable PDF appear here.
          </p>
        </div>
      )}
    </div>
  );
}
