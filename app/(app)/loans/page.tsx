import { requireRole } from '@/lib/auth/guards';
import { LoanTable } from '@/components/loans/LoanTable';

export const metadata = { title: 'Loans — KOC' };

export default async function LoansPage() {
  await requireRole('admin');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Loans</h1>
        <p className="text-sm text-gray-500 mt-0.5">Loans given out and loans taken</p>
      </div>
      <LoanTable />
    </div>
  );
}
