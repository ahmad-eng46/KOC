import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { StockReport } from '@/components/reports/StockReport';

export const metadata = { title: 'Stock Report — KOC' };

export default async function StockReportPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  const session = await getSession();
  const role = session?.role ?? 'viewer';
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Current inventory + value at cost</p>
        </div>
      </div>
      <StockReport role={role} />
    </div>
  );
}
