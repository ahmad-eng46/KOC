import { requireRole } from '@/lib/auth/guards';
import { ActivityLogTabs } from '@/components/settings/ActivityLogTabs';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Activity Log — KOC' };

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await requireRole('admin', 'accountant', 'staff');
  const session = await getSession();
  const isAdmin = session?.role === 'admin';
  const { userId } = await searchParams;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Activity Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin
              ? 'See what everyone did in the system, yourself included'
              : 'See what everyone did in the system'}
          </p>
        </div>
      </div>

      <ActivityLogTabs isAdmin={isAdmin} initialUserId={userId ?? ''} />
    </div>
  );
}
