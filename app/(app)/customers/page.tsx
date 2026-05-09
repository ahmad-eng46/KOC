import { requireRole } from '@/lib/auth/guards';
import { CustomerTable } from '@/components/customers/CustomerTable';

export const metadata = { title: 'Customers — KOC' };

export default async function CustomersPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your customer accounts</p>
      </div>
      <CustomerTable />
    </div>
  );
}
