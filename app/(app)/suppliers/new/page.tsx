import { requireRole } from '@/lib/auth/guards';
import { SupplierForm } from '@/components/suppliers/SupplierForm';

export const metadata = { title: 'New Supplier — KOC' };

export default async function NewSupplierPage() {
  await requireRole('admin', 'accountant', 'staff');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Supplier</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a vendor you buy stock from</p>
        </div>
      </div>
      <SupplierForm />
    </div>
  );
}
