import { requireRole } from '@/lib/auth/guards';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';

export const metadata = { title: 'New Expense — KOC' };

export default async function NewExpensePage() {
  await requireRole('admin', 'accountant', 'staff');
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Expense</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record an expense</p>
        </div>
      </div>
      <ExpenseForm />
    </div>
  );
}
