import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { CustomerCategoryManager } from '@/components/settings/CustomerCategoryManager';

export const metadata = { title: 'Customer Categories — KOC' };

export default async function CustomerCategoriesPage() {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customer Categories</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            How your customers are grouped — retailers, workshops, petrol pumps
          </p>
        </div>
      </div>

      <CustomerCategoryManager canDelete={session?.role === 'admin'} />
    </div>
  );
}
