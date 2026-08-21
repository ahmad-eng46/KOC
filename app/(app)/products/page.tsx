import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { ProductTable } from '@/components/products/ProductTable';
import { currentUserCanAccess } from '@/lib/auth/page-access';

export const metadata = { title: 'Products — KOC' };

export default async function ProductsPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const canSeePurchasePrice =
    session?.role === 'admin' || session?.role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Products</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your product catalogue</p>
      </div>
      <ProductTable
        isAdmin={session?.role === 'admin'}
        canCreate={await currentUserCanAccess('action.add_product')}
        canSeePurchasePrice={canSeePurchasePrice}
        canBulkAssign={canSeePurchasePrice}
      />
    </div>
  );
}
