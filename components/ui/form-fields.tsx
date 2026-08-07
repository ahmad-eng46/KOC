'use client';

/**
 * The input/label pair duplicated inline across CustomerForm, ProductForm and
 * AddStockModal, extracted so the supplier forms don't add four more copies.
 * Same classes, so it renders identically to the existing screens.
 *
 * h-11 (44px) meets the minimum tap target on mobile.
 */

export function inputCls(hasError: boolean): string {
  return [
    'w-full h-11 px-3 rounded-xl border text-sm bg-white text-gray-900',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    hasError ? 'border-red-400' : 'border-gray-300',
  ].join(' ');
}

export function textareaCls(hasError: boolean): string {
  return inputCls(hasError).replace('h-11', 'h-20 py-2') + ' resize-none';
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ServerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <p className="text-sm text-red-700">{message}</p>
    </div>
  );
}
