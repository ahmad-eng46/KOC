'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { customerSchema, type CustomerInput } from '@/lib/validators/customer';
import { createCustomer, updateCustomer } from '@/lib/actions/customer';
import { useCustomerCategories } from '@/lib/queries/customers';
import { formatPKR, rupeesToPaisa } from '@/lib/money';
import { type Customer } from '@/lib/queries/customers';
import { LocationPicker } from './LocationPicker';

/** A "— None —" select option submits '' — the schema wants null. */
const emptyToNull = (v: unknown) => (v === '' ? null : v);

type Props = {
  customer?: Customer;
};

export function CustomerForm({ customer }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: categories = [] } = useCustomerCategories();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(customerSchema),
    defaultValues: customer
      ? {
          name: customer.name,
          phone: customer.phone ?? '',
          address: customer.address ?? '',
          category_id: customer.category_id ?? null,
          location_id: customer.location_id ?? null,
          opening_balance_paisa: customer.opening_balance_paisa,
          credit_limit_paisa: customer.credit_limit_paisa ?? null,
          notes: customer.notes ?? '',
        }
      : { opening_balance_paisa: 0, location_id: null },
  });

  const locationId = useWatch({ control, name: 'location_id' });

  async function onSubmit(values: CustomerInput) {
    setServerError(null);
    try {
      const result = customer
        ? await updateCustomer(customer.id, values)
        : await createCustomer(values);

      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      router.push('/customers');
      router.refresh();
    } catch (err) {
      // Permission guards in the actions throw rather than return.
      setServerError(err instanceof Error ? err.message : 'Could not save the customer.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
      {/* Name */}
      <Field label="Customer Name *" error={errors.name?.message}>
        <input
          className={inputCls(!!errors.name)}
          placeholder="Al-Madina Petrol Pump"
          {...register('name')}
        />
      </Field>

      {/* Phone */}
      <Field label="Phone" error={errors.phone?.message}>
        <input
          className={inputCls(!!errors.phone)}
          placeholder="0300-1234567"
          type="tel"
          {...register('phone')}
        />
      </Field>

      {/* Category */}
      <Field label="Category" error={errors.category_id?.message}>
        <select
          className={inputCls(false)}
          {...register('category_id', { setValueAs: emptyToNull })}
        >
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Location */}
      <Field label="Location">
        <LocationPicker
          value={locationId ?? null}
          onChange={(id) => setValue('location_id', id, { shouldDirty: true })}
          canCreate
          customerId={customer?.id}
        />
      </Field>

      {/* Address */}
      <Field label="Address" error={errors.address?.message}>
        <textarea
          className={inputCls(false) + ' resize-none h-20'}
          placeholder="GT Road, Lahore"
          {...register('address')}
        />
      </Field>

      {/* Opening Balance */}
      <Field label="Opening Balance (Rs.)" error={errors.opening_balance_paisa?.message}>
        <input
          className={inputCls(!!errors.opening_balance_paisa)}
          placeholder="0.00"
          inputMode="decimal"
          defaultValue={
            customer ? formatPKR(customer.opening_balance_paisa, { showSymbol: false }) : '0.00'
          }
          {...register('opening_balance_paisa', {
            setValueAs: (v: unknown) =>
              typeof v === 'string' ? rupeesToPaisa(parseFloat(v) || 0) : (v as number),
          })}
        />
      </Field>

      {/* Notes */}
      <Field label="Notes" error={errors.notes?.message}>
        <textarea
          className={inputCls(false) + ' resize-none h-20'}
          placeholder="Any notes about this customer…"
          {...register('notes')}
        />
      </Field>

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
          <p className="text-sm text-red-700">{serverError}</p>
        </div>
      )}

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
          {isSubmitting ? 'Saving…' : customer ? 'Update Customer' : 'Create Customer'}
        </button>
      </div>
    </form>
  );
}

function inputCls(hasError: boolean) {
  return [
    'w-full h-11 px-3 rounded-xl border text-sm bg-white',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    hasError ? 'border-red-400' : 'border-gray-300',
  ].join(' ');
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
