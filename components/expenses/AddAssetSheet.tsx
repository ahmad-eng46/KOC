'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createExpenseAsset } from '@/lib/actions/expense-assets';
import {
  ASSET_TYPES_BY_CATEGORY,
  fuelTypes,
  expenseCategoryGroup,
} from '@/lib/validators/expense-assets';
import type { ExpenseCategory } from '@/lib/validators/expense';
import { useInvalidateExpenseAssetData } from '@/lib/queries/expense-assets';
import { Field, ServerError, inputCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';

type Props = {
  category: ExpenseCategory;
  onClose: () => void;
  /** Called with the new asset's id so the caller can auto-select it. */
  onCreated: (id: string, name: string) => void;
};

const VEHICLE_TYPES = ['car', 'bike', 'truck', 'rickshaw'];

/**
 * Quick inline "add a car / shop" flow — bottom sheet on mobile, centred
 * card on desktop. Vehicles get plate + fuel type; property gets address.
 */
export function AddAssetSheet({ category, onClose, onCreated }: Props) {
  const { showToast } = useToast();
  const invalidate = useInvalidateExpenseAssetData();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState('');
  const [plate, setPlate] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Vehicles live under the Transport/Maintenance group; chips follow it.
  const isVehicleCategory = expenseCategoryGroup(category).includes('Transport');
  const typeChips = ASSET_TYPES_BY_CATEGORY[category] ?? [];
  const isVehicleType = isVehicleCategory || VEHICLE_TYPES.includes(assetType);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setServerError('Name must be at least 2 characters.');
      return;
    }
    setServerError(null);
    setSubmitting(true);

    const details: Record<string, string> = {};
    if (isVehicleType && plate.trim()) details.plate = plate.trim();
    if (isVehicleType && fuelType) details.fuel_type = fuelType;
    if (!isVehicleType && address.trim()) details.address = address.trim();

    const result = await createExpenseAsset({
      category,
      name: name.trim(),
      asset_type: assetType || '',
      details,
    });
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    invalidate();
    showToast(`"${name.trim()}" added.`);
    onCreated(result.id, name.trim());
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
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Add to {category}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <Field label="Name *">
            <input
              className={inputCls(false)}
              placeholder={isVehicleCategory ? 'Car LHR-1234' : category === 'Rent' ? 'Shop 1 Rajana' : 'Name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>

          {typeChips.length > 0 && (
            <Field label="Type">
              <div className="flex flex-wrap gap-2">
                {typeChips.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAssetType(assetType === t ? '' : t)}
                    className={[
                      'h-10 px-4 rounded-xl border text-sm font-medium capitalize transition-colors',
                      assetType === t
                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {isVehicleType && (
            <>
              <Field label="Plate Number">
                <input
                  className={inputCls(false) + ' uppercase'}
                  placeholder="LHR-1234"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Fuel Type">
                <div className="grid grid-cols-3 gap-2">
                  {fuelTypes.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFuelType(fuelType === f ? '' : f)}
                      className={[
                        'h-10 rounded-xl border text-sm font-medium uppercase transition-colors',
                        fuelType === f
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {!isVehicleType && category === 'Rent' && (
            <Field label="Address">
              <input
                className={inputCls(false)}
                placeholder="Main Bazar Rajana"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
          )}

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
              disabled={submitting || name.trim().length < 2}
              className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
