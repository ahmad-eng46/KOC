import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { BalanceReport } from '@/components/reports/BalanceReport';

export const metadata = { title: 'Receivables — KOC' };

export default async function BalanceReportPage() {
  await requireRole('admin', 'accountant', 'staff', 'viewer');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><ChevronLeft size={18} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Receivables (Aging)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customers with outstanding balance, bucketed by days since last activity</p>
        </div>
      </div>
      <BalanceReport />
    </div>
  );
}
