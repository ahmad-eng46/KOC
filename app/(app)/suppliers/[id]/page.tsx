import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
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
  const canEdit = role ? can(role, 'suppliers.update') : false;
  const canCreatePurchase = role ? can(role, 'purchases.create') : false;
  const canCreatePayment = role ? can(role, 'supplier_payments.create') : false;
  const canSeeMoney = role === 'admin' || role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/suppliers"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
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
