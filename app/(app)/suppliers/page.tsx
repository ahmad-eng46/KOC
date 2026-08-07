import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { SupplierTable } from '@/components/suppliers/SupplierTable';

export const metadata = { title: 'Suppliers — KOC' };

export default async function SuppliersPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const role = session?.role;

  const canCreate = role ? can(role, 'suppliers.create') : false;
  const canDelete = role === 'admin';
  const canSeeMoney = role === 'admin' || role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Suppliers</h1>
        <p className="text-sm text-gray-500 mt-0.5">Who you buy stock from, and what you owe them</p>
      </div>
      <SupplierTable canCreate={canCreate} canDelete={canDelete} canSeeMoney={canSeeMoney} />
    </div>
  );
}
