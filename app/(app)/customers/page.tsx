import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { CustomerTable } from '@/components/customers/CustomerTable';

export const metadata = { title: 'Customers — KOC' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const { category } = await searchParams;
  const session = await getSession();
  const canManageCategories = session?.role === 'admin' || session?.role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your customer accounts</p>
        </div>
        {/* Accountants have no Settings sidebar entry; this is their path in */}
        {canManageCategories && (
          <Link
            href="/settings/customer-categories"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 shrink-0"
          >
            <Settings2 size={14} />
            Categories
          </Link>
        )}
      </div>
      <CustomerTable initialCategory={category ?? ''} isAdmin={session?.role === 'admin'} />
    </div>
  );
}
