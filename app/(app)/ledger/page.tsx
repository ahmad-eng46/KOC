import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/guards';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { LedgerBrowser } from '@/components/ledger/LedgerBrowser';

export const metadata = { title: 'Ledger — KOC' };

export default async function LedgerPage() {
  await requireRole('admin', 'accountant');

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) notFound();

  const supabase = await createServerClient();
  const { data } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Ledger</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Customer statement — every invoice, payment and return with a running balance
        </p>
      </div>

      <LedgerBrowser businessName={data?.name ?? '—'} />
    </div>
  );
}
