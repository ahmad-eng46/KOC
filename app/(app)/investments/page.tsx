import { requireRole } from '@/lib/auth/guards';
import { InvestmentTable } from '@/components/investments/InvestmentTable';

export const metadata = { title: 'Investments — KOC' };

export default async function InvestmentsPage() {
  await requireRole('admin');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Investments</h1>
        <p className="text-sm text-gray-500 mt-0.5">Owner / external capital invested in this business</p>
      </div>
      <InvestmentTable />
    </div>
  );
}
