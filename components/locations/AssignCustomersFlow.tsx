'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Check, MapPin, X } from 'lucide-react';
import {
  useLocations,
  useUnassignedCustomers,
  useInvalidateLocationData,
} from '@/lib/queries/locations';
import { bulkAssignLocation } from '@/lib/actions/locations';
import { useToast } from '@/components/ui/Toast';
import { formatPKR } from '@/lib/money';

/**
 * Initial-setup flow: pick unassigned shops (multi-select), pick a city,
 * assign in one server call. Desktop shows the location select inline;
 * mobile gets a FAB that opens a bottom-sheet picker.
 */
export function AssignCustomersFlow() {
  const router = useRouter();
  const { showToast } = useToast();
  const invalidate = useInvalidateLocationData();
  const { data: customers = [], isLoading } = useUnassignedCustomers();
  const { data: locations = [] } = useLocations();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          !search ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.phone ?? '').includes(search),
      ),
    [customers, search],
  );

  const activeLocations = locations.filter((l) => l.is_active);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.customer_id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.customer_id));
      else filtered.forEach((c) => next.add(c.customer_id));
      return next;
    });
  }

  async function assign(targetLocationId: string) {
    if (selected.size === 0 || !targetLocationId) return;
    setSubmitting(true);
    const result = await bulkAssignLocation({
      customer_ids: Array.from(selected),
      location_id: targetLocationId,
    });
    setSubmitting(false);

    if (!result.ok) {
      showToast(result.error, 'error');
      return;
    }

    const cityName =
      activeLocations.find((l) => l.location_id === targetLocationId)?.location_name ?? 'city';
    invalidate();
    showToast(`${result.updated} customer${result.updated === 1 ? '' : 's'} assigned to ${cityName}.`);
    setSelected(new Set());
    setSheetOpen(false);

    // Everyone assigned? Setup finished — back to the hub.
    if (result.updated >= customers.length) router.push('/locations');
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="text-center py-12">
        <Check size={32} className="mx-auto text-green-500" />
        <p className="mt-3 text-sm text-gray-600">Every customer has a city assigned.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24 md:pb-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-44">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unassigned…"
            className="w-full h-10 pl-8 pr-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={toggleAllFiltered}
          className="h-10 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          {allFilteredSelected ? 'Clear' : 'Select all'}
        </button>

        {/* Desktop: inline picker + assign */}
        <div className="hidden md:flex items-center gap-2 ml-auto">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="h-10 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select city —</option>
            {activeLocations.map((l) => (
              <option key={l.location_id} value={l.location_id}>
                {l.location_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={selected.size === 0 || !locationId || submitting}
            onClick={() => assign(locationId)}
            className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Assigning…' : `Assign ${selected.size || ''}`}
          </button>
        </div>
      </div>

      {/* Customer checklist */}
      <div className="space-y-2">
        {filtered.map((c) => {
          const isSelected = selected.has(c.customer_id);
          return (
            <button
              key={c.customer_id}
              type="button"
              onClick={() => toggle(c.customer_id)}
              className={[
                'w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors min-h-[56px]',
                isSelected
                  ? 'bg-blue-50 border-blue-400'
                  : 'bg-white border-gray-200 hover:border-gray-300',
              ].join(' ')}
            >
              <span
                className={[
                  'w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                  isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white',
                ].join(' ')}
              >
                {isSelected && <Check size={13} className="text-white" />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-gray-900 text-sm truncate">{c.name}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{c.phone ?? '—'}</span>
              </span>
              {c.current_balance_paisa > 0 && (
                <span className="text-xs font-mono text-red-600 shrink-0">
                  {formatPKR(c.current_balance_paisa)}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center py-8 text-sm text-gray-400">No unassigned customers match.</p>
        )}
      </div>

      {/* Mobile FAB */}
      {selected.size > 0 && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="md:hidden fixed bottom-5 inset-x-4 h-12 rounded-2xl bg-blue-600 text-white text-sm font-semibold shadow-lg flex items-center justify-center gap-2 z-30"
        >
          <MapPin size={16} />
          Assign {selected.size} {selected.size === 1 ? 'customer' : 'customers'}
        </button>
      )}

      {/* Mobile bottom-sheet city picker */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className="w-full bg-white rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                Assign {selected.size} to…
              </h2>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 space-y-1.5">
              {activeLocations.map((l) => (
                <button
                  key={l.location_id}
                  type="button"
                  disabled={submitting}
                  onClick={() => assign(l.location_id)}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left hover:bg-blue-50 disabled:opacity-50 min-h-[52px]"
                >
                  <MapPin size={16} className="text-gray-400 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-gray-900">
                    {l.location_name}
                  </span>
                  <span className="text-xs text-gray-400">{l.customer_count} shops</span>
                </button>
              ))}
              {activeLocations.length === 0 && (
                <p className="text-center py-6 text-sm text-gray-400">
                  No cities yet — add one from the Locations page first.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
