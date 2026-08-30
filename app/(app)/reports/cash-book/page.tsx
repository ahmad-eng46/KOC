import { requireRole } from '@/lib/auth/guards';
import { CashBookReport } from '@/components/reports/CashBookReport';

export const metadata = { title: 'Daily Cash Book — KOC' };

export default async function CashBookPage() {
  await requireRole('admin', 'accountant', 'staff');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Daily Cash Book</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cash payments in vs cash expenses out</p>
        </div>
      </div>
      <CashBookReport />
    </div>
  );
}
