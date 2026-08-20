'use client';

import Link from 'next/link';
import { useUserActivity } from '@/lib/queries/activity-log';
import { ActivityFeed } from './ActivityFeed';

export function UserActivityPanel({
  userId,
  userName,
  limit = 20,
}: {
  userId: string;
  userName: string;
  limit?: number;
}) {
  const { data = [], isLoading, error } = useUserActivity(userId, limit);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Recent activity for {userName}
        </h3>
        <Link
          href={`/settings/activity-log?userId=${userId}`}
          className="text-xs font-medium text-blue-700 hover:underline shrink-0"
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-700 p-4">
          {error instanceof Error ? error.message : 'Could not load activity.'}
        </p>
      ) : (
        <ActivityFeed entries={data} showUser={false} />
      )}
    </div>
  );
}
