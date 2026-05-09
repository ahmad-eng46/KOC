import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { StockList } from '@/components/stock/StockList';

export const metadata = { title: 'Stock — KOC' };

export default async function StockPage() {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();
  const canUpdate = session ? can(session.role, 'stock.update') : false;
  const canAdjust = session?.role === 'admin';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Stock</h1>
        <p className="text-sm text-gray-500 mt-0.5">Current inventory levels — updates in real time</p>
      </div>
      <StockList canUpdate={canUpdate} canAdjust={canAdjust} />
    </div>
  );
}
