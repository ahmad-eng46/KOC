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
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
        <p className="text-sm text-gray-500 mt-0.5">Business and home expenses</p>
      </div>
      <ExpenseTable role={role} />
    </div>
  );
}
