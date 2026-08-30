import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
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
        <Link
          href="/customers"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
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
