import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { AssignCustomersFlow } from '@/components/locations/AssignCustomersFlow';

export const metadata = { title: 'Assign Customers — KOC' };

export default async function AssignCustomersPage() {
  // Bulk assignment is a setup task — matches bulkAssignLocation and the RPC.
  await requireRole('admin', 'accountant');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/locations"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Assign Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Select shops, then pick which city they belong to
          </p>
        </div>
      </div>
      <AssignCustomersFlow />
    </div>
  );
}
