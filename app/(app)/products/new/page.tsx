import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { ProductForm } from '@/components/products/ProductForm';

export const metadata = { title: 'New Product — KOC' };

export default async function NewProductPage() {
  await requireRole('admin');

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
          <h1 className="text-xl font-semibold text-gray-900">New Product</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a product to your catalogue</p>
        </div>
      </div>
      <ProductForm canSeePurchasePrice />
    </div>
  );
}
