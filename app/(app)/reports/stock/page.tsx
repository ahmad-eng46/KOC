import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
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
        <Link href="/reports" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Stock Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Current inventory + value at cost</p>
        </div>
      </div>
      <StockReport role={role} />
    </div>
  );
}
