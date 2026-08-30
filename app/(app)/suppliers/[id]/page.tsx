import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { SupplierDetailView } from '@/components/suppliers/SupplierDetailView';
import { type Supplier } from '@/lib/queries/suppliers';

export const metadata = { title: 'Supplier — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function SupplierDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  const { id } = await params;
  const [session, businessId] = await Promise.all([
    getSession(),
    getActiveBusinessId().catch(() => null),
  ]);
  if (!businessId) notFound();

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, business_id, name, phone, address, notes, created_at')
    .eq('id', id)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .single();

  if (error || !data) notFound();
  const supplier = data as Supplier;

  const role = session?.role;
  const [canEdit, canCreatePurchase, canCreatePayment] = await Promise.all([
    currentUserCan('suppliers.update'),
    currentUserCan('purchases.create'),
    currentUserCan('supplier_payments.create'),
  ]);
  const canSeeMoney = role === 'admin' || role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{supplier.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">
            {supplier.phone ?? '—'}
            {supplier.address ? ` · ${supplier.address}` : ''}
          </p>
        </div>
      </div>

      <SupplierDetailView
        supplier={supplier}
        canEdit={canEdit}
        canCreatePurchase={canCreatePurchase}
        canCreatePayment={canCreatePayment}
        canSeeMoney={canSeeMoney}
      />
    </div>
  );
}
