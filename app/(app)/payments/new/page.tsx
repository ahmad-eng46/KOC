import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/guards';
import { PaymentForm } from '@/components/payments/PaymentForm';

export const metadata = { title: 'New Payment — KOC' };

export default async function NewPaymentPage() {
  await requireRole('admin', 'accountant', 'staff');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Payment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record a payment received from a customer</p>
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
        <PaymentForm />
      </Suspense>
    </div>
  );
}
