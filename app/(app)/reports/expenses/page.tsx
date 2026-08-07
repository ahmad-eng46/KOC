import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { ExpenseAnalytics } from '@/components/reports/ExpenseAnalytics';

export const metadata = { title: 'Expense Report — KOC' };

export default async function ExpenseReportPage() {
  // Matches the expenses module's existing access (admin/accountant).
  await requireRole('admin', 'accountant');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/reports"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expense Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            What each vehicle, shop and item costs you
          </p>
        </div>
      </div>
      <ExpenseAnalytics />
    </div>
  );
}
