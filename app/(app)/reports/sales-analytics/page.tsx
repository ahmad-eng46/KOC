import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireAuth } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { currentUserCan } from '@/lib/auth/can-user';
import { SalesAnalytics } from '@/components/reports/SalesAnalytics';

export const metadata = { title: 'Sales Analytics — KOC' };

export default async function SalesAnalyticsPage() {
  await requireAuth();

  // Gated on the permission, not the role, so an admin can hand a staff member
  // access with an override without changing what the role means for everyone.
  if (!(await currentUserCan('reports.view'))) redirect('/no-access');

  // Iron rule #3: cost and profit are decided by the role in the database, and
  // the UI is told the same answer so it does not render empty columns.
  const session = await getSession();
  const canSeeCost = session?.role === 'admin' || session?.role === 'accountant';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/reports"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Sales Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">What sold, by brand and by product</p>
        </div>
      </div>

      <SalesAnalytics canSeeCost={canSeeCost} />
    </div>
  );
}
