import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { CustomerDetailTabs } from '@/components/customers/CustomerDetailTabs';
import { type Customer } from '@/lib/queries/customers';

export const metadata = { title: 'Customer — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  const { id } = await params;
  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) notFound();

  const supabase = await createServerClient();
  const [custRes, bizRes] = await Promise.all([
    supabase
      .from('customers')
      .select('*, customer_categories(name)')
      .eq('id', id)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single(),
  ]);

  if (custRes.error || !custRes.data) notFound();

  const customer = custRes.data as Customer;
  const businessName = bizRes.data?.name ?? '—';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/customers"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{customer.phone ?? '—'}</p>
        </div>
      </div>
      <CustomerDetailTabs customer={customer} businessName={businessName} />
    </div>
  );
}
