import { requireRole } from '@/lib/auth/guards';
import { currentUserCan } from '@/lib/auth/can-user';
import { StockList } from '@/components/stock/StockList';

export const metadata = { title: 'Stock — KOC' };

export default async function StockPage() {
  await requireRole('admin', 'accountant', 'staff');
  // canAdjust rides on stock.update rather than a role: stock_movements_insert
  // already admitted staff, so hiding the Adjustment option was the UI
  // withholding something the database allowed.
  const [canUpdate, canPurchase, canCreateSupplier] = await Promise.all([
    currentUserCan('stock.update'),
    currentUserCan('purchases.create'),
    currentUserCan('suppliers.create'),
  ]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Stock</h1>
        <p className="text-sm text-gray-500 mt-0.5">Current inventory levels — updates in real time</p>
      </div>
      <StockList
        canUpdate={canUpdate}
        canAdjust={canUpdate}
        canPurchase={canPurchase}
        canCreateSupplier={canCreateSupplier}
      />
    </div>
  );
}
