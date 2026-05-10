import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';

export const metadata = { title: 'Invoice — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const role = session?.role ?? 'viewer';
  const { id } = await params;

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
          <h1 className="text-xl font-semibold text-gray-900">Invoice Detail</h1>
        </div>
      </div>
      <InvoiceDetail invoiceId={id} role={role} />
    </div>
  );
}
