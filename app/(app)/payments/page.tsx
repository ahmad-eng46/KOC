import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { PaymentTable } from '@/components/payments/PaymentTable';

export const metadata = { title: 'Payments — KOC' };

export default async function PaymentsPage() {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();
  const role = session?.role ?? 'viewer';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Payments</h1>
        <p className="text-sm text-gray-500 mt-0.5">All customer payments received</p>
      </div>
      <PaymentTable role={role} />
    </div>
  );
}
