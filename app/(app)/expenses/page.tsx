import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';

export const metadata = { title: 'Expenses — KOC' };

export default async function ExpensesPage() {
  await requireRole('admin', 'accountant');
  const session = await getSession();
  const role = session?.role ?? 'viewer';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Business and home expenses</p>
        </div>
        {/* Accountants have no Settings sidebar entry; this is their path in */}
        <Link
          href="/settings/expense-assets"
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 shrink-0"
        >
          <Settings2 size={14} />
          Manage Items
        </Link>
      </div>
      <ExpenseTable role={role} />
    </div>
  );
}
