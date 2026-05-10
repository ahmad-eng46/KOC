import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { ReturnForm } from '@/components/invoices/ReturnForm';

export const metadata = { title: 'Process Return — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function ReturnPage({ params }: Props) {
  await requireRole('admin', 'accountant');
  const { id } = await params;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/invoices/${id}`}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Process Return</h1>
          <p className="text-sm text-gray-500 mt-0.5">Return items from this invoice</p>
        </div>
      </div>
      <ReturnForm invoiceId={id} />
    </div>
  );
}
