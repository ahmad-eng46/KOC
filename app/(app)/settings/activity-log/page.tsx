import { requireRole } from '@/lib/auth/guards';
import { ActivityLogView } from '@/components/settings/ActivityLogView';

export const metadata = { title: 'Activity Log — KOC' };

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await requireRole('admin', 'accountant', 'staff');
  const { userId } = await searchParams;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Activity Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">See what everyone did in the system</p>
        </div>
      </div>

      <ActivityLogView initialUserId={userId ?? ''} />
    </div>
  );
}
