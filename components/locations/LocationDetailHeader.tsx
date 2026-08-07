'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocation, useInvalidateLocationData } from '@/lib/queries/locations';
import { deleteLocation } from '@/lib/actions/locations';
import { formatPKR } from '@/lib/money';
import { useToast } from '@/components/ui/Toast';
import { AddLocationModal } from './AddLocationModal';

type Props = {
  locationId: string;
  canManage: boolean;
  canDelete: boolean;
};

/** Live stats strip + edit/delete controls for one city. */
export function LocationDetailHeader({ locationId, canManage, canDelete }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const invalidate = useInvalidateLocationData();
  const { data: location } = useLocation(locationId);
  const [editOpen, setEditOpen] = useState(false);

  if (!location) return null;

  async function handleDelete() {
    if (!location) return;
    if (!confirm(`Delete ${location.location_name}?`)) return;
    const result = await deleteLocation(location.location_id);
    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }
    invalidate();
    showToast(`City "${location.location_name}" deleted.`);
    router.push('/locations');
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Shops</p>
          <p className="text-lg font-semibold text-gray-900">{location.customer_count}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">With Dues</p>
          <p className="text-lg font-semibold text-gray-900">{location.customers_with_dues}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Outstanding</p>
          <p
            className={[
              'text-lg font-bold font-mono',
              location.total_outstanding_paisa > 0 ? 'text-red-600' : 'text-green-600',
            ].join(' ')}
          >
            {formatPKR(location.total_outstanding_paisa)}
          </p>
        </div>

        {canManage && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setEditOpen(true)}
              aria-label="Edit city"
              className="p-2.5 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            >
              <Pencil size={16} />
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                aria-label="Delete city"
                className="p-2.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {editOpen && <AddLocationModal location={location} onClose={() => setEditOpen(false)} />}
    </>
  );
}
