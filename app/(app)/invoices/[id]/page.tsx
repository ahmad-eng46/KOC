import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail';

export const metadata = { title: 'Invoice — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const role = session?.role ?? 'viewer';
  const { id } = await params;
  const [canMarkPaid, canReturn] = await Promise.all([
    currentUserCan('payments.create'),
    currentUserCan('returns.create'),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoice Detail</h1>
        </div>
      </div>
      <InvoiceDetail invoiceId={id} role={role} canMarkPaid={canMarkPaid} canReturn={canReturn} />
    </div>
  );
}
