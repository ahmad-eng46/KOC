import { requireRole } from '@/lib/auth/guards';
import { BalanceReport } from '@/components/reports/BalanceReport';

export const metadata = { title: 'Receivables — KOC' };

export default async function BalanceReportPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Receivables (Aging)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customers with outstanding balance, bucketed by days since last activity</p>
        </div>
      </div>
      <BalanceReport />
    </div>
  );
}
