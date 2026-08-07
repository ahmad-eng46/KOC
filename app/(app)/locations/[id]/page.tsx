import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { LocationCustomerList } from '@/components/locations/LocationCustomerList';
import { LocationDetailHeader } from '@/components/locations/LocationDetailHeader';

export const metadata = { title: 'Location — KOC' };

type Props = { params: Promise<{ id: string }> };

/**
 * One city's customers. The reserved id "unassigned" shows customers with no
 * location — same list and filters, no city header.
 */
export default async function LocationDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  const { id } = await params;
  const [session, businessId] = await Promise.all([
    getSession(),
    getActiveBusinessId().catch(() => null),
  ]);
  if (!businessId) notFound();

  const canManage = session?.role === 'admin' || session?.role === 'accountant';
  const canDelete = session?.role === 'admin';
  const isUnassigned = id === 'unassigned';

  let name = 'Unassigned';
  if (!isUnassigned) {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from('locations')
      .select('name')
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .single();
    if (error || !data) notFound();
    name = data.name;
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/locations"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isUnassigned ? 'Customers with no city assigned' : 'Shops on this route'}
          </p>
        </div>
      </div>

      {!isUnassigned && (
        <LocationDetailHeader locationId={id} canManage={canManage} canDelete={canDelete} />
      )}

      <LocationCustomerList locationId={isUnassigned ? 'unassigned' : id} />
    </div>
  );
}
