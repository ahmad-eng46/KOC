import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { LocationsHub } from '@/components/locations/LocationsHub';

export const metadata = { title: 'Locations — KOC' };

export default async function LocationsPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const canManage = session?.role === 'admin' || session?.role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Locations</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tap a city to see its shops, dues and payments
        </p>
      </div>
      <LocationsHub canManage={canManage} />
    </div>
  );
}
