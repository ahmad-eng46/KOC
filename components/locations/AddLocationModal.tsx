'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { locationSchema, type LocationInput } from '@/lib/validators/locations';
import { createLocation, updateLocation } from '@/lib/actions/locations';
import { useInvalidateLocationData } from '@/lib/queries/locations';
import { Field, ServerError, inputCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';
import type { LocationSummary } from '@/lib/queries/locations';

type Props = {
  /** Present = edit mode. */
  location?: LocationSummary;
  onClose: () => void;
};

export function AddLocationModal({ location, onClose }: Props) {
  const { showToast } = useToast();
  const invalidate = useInvalidateLocationData();
  const [serverError, setServerError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      name: location?.location_name ?? '',
      short_code: location?.short_code ?? '',
      sort_order: location?.sort_order ?? 0,
    },
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(values: LocationInput) {
    setServerError(null);
    const result = location
      ? await updateLocation(location.location_id, values)
      : await createLocation(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    invalidate();
    showToast(location ? 'City updated.' : `City "${values.name}" added.`);
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {location ? 'Edit City' : 'Add City'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <Field label="City / Area Name *" error={errors.name?.message}>
            <input className={inputCls(!!errors.name)} placeholder="Rajana" {...register('name')} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Short Code" error={errors.short_code?.message} hint="e.g. RJN">
              <input
                className={inputCls(!!errors.short_code) + ' uppercase'}
                placeholder="RJN"
                maxLength={5}
                {...register('short_code', {
                  setValueAs: (v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v),
                })}
              />
            </Field>

            <Field label="Route Order" error={errors.sort_order?.message} hint="Lower = earlier">
              <input
                className={inputCls(!!errors.sort_order)}
                placeholder="1"
                inputMode="numeric"
                {...register('sort_order', {
                  setValueAs: (v: unknown) => {
                    if (typeof v !== 'string') return v as number;
                    if (v.trim() === '') return 0;
                    const n = parseInt(v, 10);
                    return Number.isNaN(n) ? NaN : n;
                  },
                })}
              />
            </Field>
          </div>

          <ServerError message={serverError} />

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
              disabled={isSubmitting}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving…' : location ? 'Update City' : 'Add City'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
