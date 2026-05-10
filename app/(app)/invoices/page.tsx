import { requireRole } from '@/lib/auth/guards';
import { InvoiceTable } from '@/components/invoices/InvoiceTable';

export const metadata = { title: 'Invoices — KOC' };

export default async function InvoicesPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-500 mt-0.5">All sales invoices for this business</p>
      </div>
      <InvoiceTable />
    </div>
  );
}
