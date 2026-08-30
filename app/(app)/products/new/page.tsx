import { requirePermission } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { roleAllowsCostPrice } from '@/lib/auth/permissions';
import { ProductForm } from '@/components/products/ProductForm';

export const metadata = { title: 'New Product — KOC' };

export default async function NewProductPage() {
  await requirePermission('products.create');
  const session = await getSession();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Product</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a product to your catalogue</p>
        </div>
      </div>
      <ProductForm canSeePurchasePrice={!!session && roleAllowsCostPrice(session.role)} />
    </div>
  );
}
