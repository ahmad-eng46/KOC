import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { PurchaseReport } from '@/components/reports/PurchaseReport';

export const metadata = { title: 'Purchase Report — KOC' };

export default async function PurchaseReportPage() {
  await requireRole('admin', 'accountant');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Purchase Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stock-in movements with cost</p>
        </div>
      </div>
      <PurchaseReport />
    </div>
  );
}
