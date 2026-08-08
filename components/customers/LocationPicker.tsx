'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus, X } from 'lucide-react';
import { useLocations, useInvalidateLocationData } from '@/lib/queries/locations';
import { createLocation, assignCustomerLocation } from '@/lib/actions/locations';
import { useToast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (locationId: string | null) => void;
  /** Quick-create needs admin/accountant; hide the option otherwise. */
  canCreate: boolean;
  /**
   * The customer being edited, when there is one. Adding a city from a
   * customer's own form means "this shop is in that city", so the customer is
   * attached to it immediately rather than waiting for Update Customer.
   * Absent on /customers/new — there is no row to attach yet.
   */
  customerId?: string;
};

/**
 * "Location" dropdown for the customer form, with "+ Add new location" pinned
 * at the bottom. The quick-create sheet asks only for the name — short code
 * and sort order live in the full form under Locations.
 */
export function LocationPicker({ value, onChange, canCreate, customerId }: Props) {
  const { data: locations = [] } = useLocations();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = locations.filter((l) => l.is_active);
  const selected = active.find((l) => l.location_id === value) ?? null;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-11 px-3 rounded-xl border text-sm bg-white flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          selected ? 'border-blue-300 text-gray-900' : 'border-gray-300 text-gray-400',
        ].join(' ')}
      >
        <span className="truncate">{selected ? selected.location_name : 'No location'}</span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span
              role="button"
              aria-label="Clear location"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="p-1 rounded text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={15} className="text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {active.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No locations yet.</p>
            )}
            {active.map((l) => (
              <button
                key={l.location_id}
                type="button"
                onClick={() => {
                  onChange(l.location_id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-11"
              >
                <span className="text-gray-900 truncate">
                  {l.location_name}
                  {l.short_code && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase text-gray-400">
                      {l.short_code}
                    </span>
                  )}
                </span>
                {l.location_id === value && <Check size={15} className="text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-green-700 border-t border-gray-100 hover:bg-green-50 min-h-11"
            >
              <Plus size={15} />
              Add new location
            </button>
          )}
        </div>
      )}

      {createOpen && (
        <QuickCreateLocationSheet
          customerId={customerId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => onChange(id)}
        />
      )}
    </div>
  );
}

/**
 * One field, save — the whole flow in a couple of seconds.
 *
 * Portalled to <body>: the picker is rendered inside CustomerForm's <form>,
 * and a <form> nested in a <form> is invalid HTML — the submit here would
 * bubble into the customer form's handler, saving the customer and navigating
 * away before this action's request was ever sent. React portals still
 * propagate events through the React tree, so the submit handler also stops
 * propagation.
 */
function QuickCreateLocationSheet({
  customerId, onClose, onCreated,
}: {
  customerId?: string;
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const invalidate = useInvalidateLocationData();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (name.trim().length < 2) {
      setServerError('Name must be at least 2 characters.');
      return;
    }
    setServerError(null);
    setSubmitting(true);

    try {
      const result = await createLocation({ name: name.trim(), short_code: '', sort_order: 0 });

      if (!result.ok) {
        setServerError(result.error);
        showToast(result.error, 'error');
        return;
      }

      // Attaching the customer is what the user came here to do, so it happens
      // now rather than waiting for Update Customer. The form field is set
      // either way, so Update Customer still carries the city if this fails.
      const link = customerId
        ? await assignCustomerLocation({ customer_id: customerId, location_id: result.id })
        : null;

      // Awaited so the dropdown already holds the new location when it is
      // selected below — otherwise the picker briefly reads "No location".
      await invalidate();
      onCreated(result.id, result.name);
      onClose();

      if (link && !link.ok) {
        showToast(
          `Location "${result.name}" added, but this customer was not attached: ${link.error} Press Update Customer to retry.`,
          'error',
        );
      } else if (link) {
        showToast(`Location "${result.name}" added, and this customer assigned to it.`);
      } else {
        showToast(`Location "${result.name}" added.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the location.';
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Location</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Location Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type the city or route name"
              autoFocus
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {serverError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <p className="text-sm text-red-700">{serverError}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
