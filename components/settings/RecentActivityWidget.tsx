'use client';

import Link from 'next/link';
import { useRecentActivity } from '@/lib/queries/activity-log';
import { ActivityFeed } from './ActivityFeed';

/** Dashboard card: the last few things anyone did. Admin/accountant only. */
export function RecentActivityWidget({ limit = 5 }: { limit?: number }) {
  const { data = [], isLoading, error } = useRecentActivity(limit);

  // RLS answers with an error for roles that may not read the log. Rendering
  // nothing is the right outcome — the card simply does not belong to them.
  if (error) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
        <Link
          href="/settings/activity-log"
          className="text-xs font-medium text-blue-700 hover:underline shrink-0"
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : (
        <ActivityFeed entries={data} compact />
      )}
    </section>
  );
}
