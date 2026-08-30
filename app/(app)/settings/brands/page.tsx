import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { BrandManager } from '@/components/settings/BrandManager';

export const metadata = { title: 'Brands & Suppliers — KOC' };

export default async function BrandsPage() {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Brands & Suppliers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            The companies and dealers your products come from
          </p>
        </div>
      </div>
      <BrandManager canDelete={session?.role === 'admin'} />
    </div>
  );
}
