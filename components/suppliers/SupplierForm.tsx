'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierSchema, type SupplierInput } from '@/lib/validators/suppliers';
import { createSupplier, updateSupplier } from '@/lib/actions/suppliers';
import { Field, ServerError, inputCls, textareaCls } from '@/components/ui/form-fields';
import { useToast } from '@/components/ui/Toast';
import type { Supplier } from '@/lib/queries/suppliers';

type Props = {
  supplier?: Supplier;
  /** Read-only roles get the same layout with inputs disabled. */
  canEdit?: boolean;
};

export function SupplierForm({ supplier, canEdit = true }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? '',
      phone: supplier?.phone ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  async function onSubmit(values: SupplierInput) {
    setServerError(null);
    const result = supplier
      ? await updateSupplier(supplier.id, values)
      : await createSupplier(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    showToast(supplier ? 'Supplier updated.' : `Supplier "${values.name}" added.`);
    router.push(supplier ? `/suppliers/${supplier.id}` : '/suppliers');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      <Field label="Supplier Name *" error={errors.name?.message}>
        <input
          className={inputCls(!!errors.name)}
          placeholder="Malik Oil Traders"
          disabled={!canEdit}
          {...register('name')}
        />
      </Field>

      <Field label="Phone" error={errors.phone?.message}>
        <input
          className={inputCls(!!errors.phone)}
          placeholder="0300-1234567"
          type="tel"
          inputMode="tel"
          disabled={!canEdit}
          {...register('phone')}
        />
      </Field>

      <Field label="Address" error={errors.address?.message}>
        <textarea
          className={textareaCls(!!errors.address)}
          placeholder="GT Road, Lahore"
          disabled={!canEdit}
          {...register('address')}
        />
      </Field>

      <Field label="Notes" error={errors.notes?.message}>
        <textarea
          className={textareaCls(!!errors.notes)}
          placeholder="Payment terms, contact person…"
          disabled={!canEdit}
          {...register('notes')}
        />
      </Field>

      <ServerError message={serverError} />

      {canEdit && (
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 h-11 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-11 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : supplier ? 'Update Supplier' : 'Create Supplier'}
          </button>
        </div>
      )}
    </form>
  );
}
