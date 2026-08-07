'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, MapPin, Inbox, UserPlus, CheckCircle2 } from 'lucide-react';
import { useLocations, useUnassignedCustomers } from '@/lib/queries/locations';
import { formatPKR } from '@/lib/money';
import { AddLocationModal } from './AddLocationModal';

type Props = {
  canManage: boolean;
};

/**
 * The dashboard the owner drives with: one big tappable card per city, in
 * his route order. Glance → who owes → tap → collect.
 */
export function LocationsHub({ canManage }: Props) {
  const { data: locations = [], isLoading } = useLocations();
  const { data: unassigned = [] } = useUnassignedCustomers();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  const active = locations.filter((l) => l.is_active);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {canManage && unassigned.length > 0 && (
          <Link
            href="/locations/assign"
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100"
          >
            <UserPlus size={15} />
            Assign Customers ({unassigned.length})
          </Link>
        )}
        {canManage && (
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 ml-auto"
          >
            <Plus size={15} />
            Add City
          </button>
        )}
      </div>

      {active.length === 0 && (
        <div className="text-center py-12">
          <MapPin size={32} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No cities yet.</p>
          {canManage && (
            <p className="text-xs text-gray-400 mt-1">
              Add your delivery route cities, then assign customers to them.
            </p>
          )}
        </div>
      )}

      {/* City grid — 2-up on a 375px phone, wider on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {active.map((l) => {
          const allClear = l.total_outstanding_paisa === 0;
          return (
            <Link
              key={l.location_id}
              href={`/locations/${l.location_id}`}
              className="group bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all min-h-[128px] flex flex-col"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 leading-tight">
                  {l.location_name}
                </h2>
                {l.short_code && (
                  <span className="shrink-0 text-[10px] font-mono font-semibold text-gray-400 border border-gray-200 rounded px-1 py-0.5">
                    {l.short_code}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 mt-1">
                {l.customer_count} {l.customer_count === 1 ? 'shop' : 'shops'}
              </p>

              <div className="mt-auto pt-3">
                {allClear ? (
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-green-600">
                    <CheckCircle2 size={14} />
                    All clear
                  </p>
                ) : (
                  <>
                    <p className="text-base font-bold font-mono text-red-600 leading-tight">
                      {formatPKR(l.total_outstanding_paisa)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {l.customers_with_dues} of {l.customer_count} have dues
                    </p>
                  </>
                )}
              </div>
            </Link>
          );
        })}

        {/* Unassigned — always last */}
        <Link
          href="/locations/unassigned"
          className={[
            'group rounded-2xl border p-4 min-h-[128px] flex flex-col transition-all',
            unassigned.length > 0
              ? 'bg-amber-50 border-amber-300 hover:border-amber-400 hover:shadow-sm'
              : 'bg-white border-dashed border-gray-300 hover:border-gray-400',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold text-gray-700 leading-tight">Unassigned</h2>
            <Inbox size={16} className={unassigned.length > 0 ? 'text-amber-500' : 'text-gray-300'} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {unassigned.length === 0
              ? 'Every shop has a city'
              : `${unassigned.length} ${unassigned.length === 1 ? 'shop needs' : 'shops need'} a city`}
          </p>
          {unassigned.length > 0 && (
            <div className="mt-auto pt-3">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {unassigned.length} to assign
              </span>
            </div>
          )}
        </Link>
      </div>

      {modalOpen && <AddLocationModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
