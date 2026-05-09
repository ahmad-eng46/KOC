import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { CustomerForm } from '@/components/customers/CustomerForm';

export const metadata = { title: 'New Customer — KOC' };

export default async function NewCustomerPage() {
  await requireRole('admin', 'accountant', 'staff');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/customers"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">New Customer</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add a new customer account</p>
        </div>
      </div>
      <CustomerForm />
    </div>
  );
}
