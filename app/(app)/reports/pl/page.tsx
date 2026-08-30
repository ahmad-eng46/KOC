import { requireRole } from '@/lib/auth/guards';
import { PLReport } from '@/components/reports/PLReport';

export const metadata = { title: 'Profit & Loss — KOC' };

export default async function PLReportPage() {
  await requireRole('admin', 'accountant', 'staff');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Profit & Loss</h1>
          <p className="text-sm text-gray-500 mt-0.5">Net Sales − COGS − Expenses</p>
        </div>
      </div>
      <PLReport />
    </div>
  );
}
