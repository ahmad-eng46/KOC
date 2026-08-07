import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { ProductForm } from '@/components/products/ProductForm';
import { ProductPurchaseHistory } from '@/components/products/ProductPurchaseHistory';
import { ProductStockHistory } from '@/components/products/ProductStockHistory';
import { type Product } from '@/lib/queries/products';

export const metadata = { title: 'Edit Product — KOC' };

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailPage({ params }: Props) {
  await requireRole('admin', 'accountant', 'staff', 'viewer');

  const { id } = await params;
  const [session, businessId] = await Promise.all([
    getSession(),
    getActiveBusinessId().catch(() => null),
  ]);

  if (!businessId) notFound();

  const canSeePurchasePrice =
    session?.role === 'admin' || session?.role === 'accountant';

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('products_for_role')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .single();

  if (error || !data) notFound();

  const product = { ...data, quantity_on_hand: 0 } as Product;
  const canEdit = session?.role === 'admin';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{product.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {canEdit ? 'Edit product details' : 'Product details'}
          </p>
        </div>
      </div>

      {canEdit ? (
        <ProductForm product={product} canSeePurchasePrice={canSeePurchasePrice} />
      ) : (
        <ProductReadView product={product} canSeePurchasePrice={canSeePurchasePrice} />
      )}

      <div className="pt-2 max-w-3xl">
        <ProductPurchaseHistory productId={id} canSeeMoney={canSeePurchasePrice} />
      </div>

      {session?.role !== 'viewer' && (
        <div className="pt-2 max-w-3xl">
          <ProductStockHistory productId={id} unit={product.unit} />
        </div>
      )}
    </div>
  );
}

function ProductReadView({
  product,
  canSeePurchasePrice,
}: {
  product: Product;
  canSeePurchasePrice: boolean;
}) {
  const fields: { label: string; value: string }[] = [
    { label: 'Name', value: product.name },
    { label: 'SKU', value: product.sku ?? '—' },
    { label: 'Unit', value: product.unit },
    {
      label: 'Sale Price',
      value: `Rs. ${(product.sale_price_paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`,
    },
    ...(canSeePurchasePrice && product.purchase_price_paisa != null
      ? [
          {
            label: 'Purchase Price',
            value: `Rs. ${(product.purchase_price_paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`,
          },
        ]
      : []),
    { label: 'Low Stock Alert', value: product.low_stock_threshold?.toString() ?? '—' },
    { label: 'Status', value: product.is_active ? 'Active' : 'Inactive' },
  ];

  return (
    <div className="max-w-lg space-y-1">
      {fields.map((f) => (
        <div key={f.label} className="flex items-start py-2.5 border-b border-gray-100 last:border-0">
          <span className="w-40 shrink-0 text-sm text-gray-500">{f.label}</span>
          <span className="text-sm font-medium text-gray-900">{f.value}</span>
        </div>
      ))}
    </div>
  );
}
