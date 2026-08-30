import { requireRole } from '@/lib/auth/guards';
import { ExpenseAnalytics } from '@/components/reports/ExpenseAnalytics';

export const metadata = { title: 'Expense Report — KOC' };

export default async function ExpenseReportPage() {
  // Matches the expenses module's existing access (admin/accountant).
  await requireRole('admin', 'accountant', 'staff');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
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
