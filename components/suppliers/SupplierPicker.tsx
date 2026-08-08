'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus, X } from 'lucide-react';
import { useSuppliers, useInvalidateSupplierData } from '@/lib/queries/suppliers';
import { createSupplier } from '@/lib/actions/suppliers';
import { useToast } from '@/components/ui/Toast';

type Props = {
  value: string | null;
  onChange: (supplierId: string | null) => void;
  /** Quick-create needs suppliers.create; hide the option otherwise. */
  canCreate: boolean;
  /** Locked to one supplier when opened from that supplier's own page. */
  disabled?: boolean;
};

/**
 * "Supplier" dropdown for the purchase form, with "+ Add new supplier" pinned
 * at the bottom so a delivery from someone new can be recorded without
 * abandoning the form. The quick-create sheet asks only for the name; phone,
 * address and notes live in the full form under Suppliers.
 */
export function SupplierPicker({ value, onChange, canCreate, disabled }: Props) {
  const { data: suppliers = [] } = useSuppliers();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = suppliers.find((s) => s.id === value) ?? null;

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
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          'w-full h-11 px-3 rounded-xl border text-sm bg-white flex items-center justify-between gap-2',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500',
          selected ? 'border-blue-300 text-gray-900' : 'border-gray-300 text-gray-400',
        ].join(' ')}
      >
        <span className="truncate">{selected ? selected.name : 'Select supplier'}</span>
        <ChevronDown size={15} className="text-gray-400 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {suppliers.length === 0 && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No suppliers yet.</p>
            )}
            {suppliers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-blue-50 min-h-11"
              >
                <span className="text-gray-900 truncate">{s.name}</span>
                {s.id === value && <Check size={15} className="text-blue-600 shrink-0" />}
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
              Add new supplier
            </button>
          )}
        </div>
      )}

      {createOpen && (
        <QuickCreateSupplierSheet
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => onChange(id)}
        />
      )}
    </div>
  );
}

/**
 * Portalled to <body>: the picker sits inside AddPurchaseModal's <form>, and a
 * <form> nested in a <form> is invalid HTML — the submit here would bubble into
 * the purchase form's handler and try to save a half-filled purchase. React
 * portals still propagate events through the React tree, so the submit handler
 * also stops propagation.
 */
function QuickCreateSupplierSheet({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string, name: string) => void;
}) {
  const { showToast } = useToast();
  const invalidate = useInvalidateSupplierData();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
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
    if (name.trim().length < 1) {
      setServerError('Name is required.');
      return;
    }
    setServerError(null);
    setSubmitting(true);

    try {
      const result = await createSupplier({ name: name.trim(), phone: phone.trim() });

      if (!result.ok) {
        setServerError(result.error);
        showToast(result.error, 'error');
        return;
      }

      // Awaited so the dropdown already holds the new supplier when it is
      // selected below — otherwise the picker briefly reads "Select supplier".
      await invalidate();
      onCreated(result.id, result.name);
      onClose();
      showToast(`Supplier "${result.name}" added.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the supplier.';
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Supplier</h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Supplier Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type the supplier or company name"
              autoFocus
              className="w-full h-11 px-3 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0300-1234567"
              type="tel"
              inputMode="tel"
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
              disabled={submitting || name.trim().length < 1}
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
