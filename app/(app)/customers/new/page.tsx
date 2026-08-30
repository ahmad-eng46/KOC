import { requireRole } from '@/lib/auth/guards';
import { currentUserCan } from '@/lib/auth/can-user';
import { CustomerForm } from '@/components/customers/CustomerForm';

export const metadata = { title: 'New Customer — KOC' };

export default async function NewCustomerPage() {
  await requireRole('admin', 'accountant', 'staff');
  const canCreateCategory = await currentUserCan('customers.update');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Customer</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a new customer account</p>
        </div>
      </div>
      <CustomerForm canCreateCategory={canCreateCategory} />
    </div>
  );
}
