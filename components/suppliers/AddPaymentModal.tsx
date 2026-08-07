'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import {
  supplierPaymentSchema,
  paymentMethods,
  PAYMENT_METHOD_LABELS,
  type SupplierPaymentInput,
} from '@/lib/validators/suppliers';
import { createSupplierPayment } from '@/lib/actions/suppliers';
import {
  useSuppliers,
  useSupplierBalance,
  useInvalidateSupplierData,
} from '@/lib/queries/suppliers';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { Field, ServerError, inputCls, textareaCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';

type Props = {
  defaultSupplierId?: string;
  onClose: () => void;
  onSuccess?: () => void;
};

function todayISO() {
  return format(new Date(), 'yyyy-MM-dd');
}

function rupeesFieldToPaisa(v: unknown): number {
  if (typeof v !== 'string') return v as number;
  const trimmed = v.trim();
  if (trimmed === '') return NaN;
  const n = parseFloat(trimmed.replace(/,/g, ''));
  return Number.isNaN(n) ? NaN : rupeesToPaisa(n);
}

export function AddPaymentModal({ defaultSupplierId, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const invalidate = useInvalidateSupplierData();
  const { data: suppliers = [] } = useSuppliers();
  const [serverError, setServerError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: {
      supplier_id: defaultSupplierId ?? '',
      amount_paisa: undefined,
      payment_date: todayISO(),
      payment_method: 'cash' as const,
      reference: '',
      notes: '',
    },
  });

  const supplierId = useWatch({ control, name: 'supplier_id' });
  const method = useWatch({ control, name: 'payment_method' });
  const { data: balance } = useSupplierBalance(supplierId || '');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function onSubmit(values: SupplierPaymentInput) {
    setServerError(null);
    const result = await createSupplierPayment(values);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    invalidate();
    showToast(`Payment of ${formatPKR(values.amount_paisa)} recorded.`);
    onSuccess?.();
    onClose();
  }

  const outstanding = balance?.balance_due_paisa ?? null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Payment</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <Field label="Supplier *" error={errors.supplier_id?.message}>
            <select
              className={inputCls(!!errors.supplier_id)}
              disabled={!!defaultSupplierId}
              {...register('supplier_id')}
            >
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          {outstanding !== null && (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-3">
              <span className="text-sm text-gray-600">
                {outstanding > 0 ? 'Currently owed' : outstanding < 0 ? 'In credit' : 'Settled'}
              </span>
              <span
                className={[
                  'text-sm font-semibold font-mono',
                  outstanding > 0 ? 'text-red-600' : outstanding < 0 ? 'text-green-600' : 'text-gray-500',
                ].join(' ')}
              >
                {formatPKR(Math.abs(outstanding))}
              </span>
            </div>
          )}

          <Field label="Amount (Rs.) *" error={errors.amount_paisa?.message}>
            <input
              className={inputCls(!!errors.amount_paisa)}
              placeholder="50000.00"
              inputMode="decimal"
              {...register('amount_paisa', { setValueAs: rupeesFieldToPaisa })}
            />
          </Field>

          <Field label="Payment Date *" error={errors.payment_date?.message}>
            <input
              type="date"
              className={inputCls(!!errors.payment_date)}
              {...register('payment_date')}
            />
          </Field>

          <Field label="Payment Method *" error={errors.payment_method?.message}>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => (
                <label
                  key={m}
                  className={[
                    'h-11 flex items-center justify-center rounded-xl border text-sm font-medium cursor-pointer transition-colors select-none',
                    method === m
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <input type="radio" value={m} {...register('payment_method')} className="sr-only" />
                  {PAYMENT_METHOD_LABELS[m]}
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Reference"
            error={errors.reference?.message}
            hint="Cheque number, transaction ID…"
          >
            <input
              className={inputCls(!!errors.reference)}
              placeholder="CHQ-004512"
              {...register('reference')}
            />
          </Field>

          <Field label="Notes" error={errors.notes?.message}>
            <textarea
              className={textareaCls(!!errors.notes)}
              placeholder="Anything worth recording…"
              {...register('notes')}
            />
          </Field>

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
              {isSubmitting ? 'Saving…' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
