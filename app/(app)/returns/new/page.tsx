import { requireRole } from '@/lib/auth/guards';
import { ReturnEntryFlow } from '@/components/invoices/ReturnEntryFlow';

export const metadata = { title: 'New Return — KOC' };

export default async function NewReturnPage() {
  await requireRole('admin', 'accountant', 'staff');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Return</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pick the customer, then the invoice they bought against
          </p>
        </div>
      </div>
      <ReturnEntryFlow />
    </div>
  );
}
