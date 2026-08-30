import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { ExpenseAssetManager } from '@/components/settings/ExpenseAssetManager';

export const metadata = { title: 'Expense Items — KOC' };

export default async function ExpenseAssetsPage() {
  // Accountants manage assets too; only the sidebar entry is admin-gated.
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expense Items</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Your vehicles, shops and other tracked items — and their expense types
          </p>
        </div>
      </div>
      <ExpenseAssetManager canDelete={session?.role === 'admin'} />
    </div>
  );
}
