import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';

export const metadata = { title: 'New Invoice — KOC' };

export default async function NewInvoicePage() {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();
  const role = session?.role ?? 'viewer';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/invoices"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Invoice</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create a sales invoice</p>
        </div>
      </div>
      <InvoiceForm role={role} />
    </div>
  );
}
