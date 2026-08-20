'use client';

import { useMemo, useState } from 'react';
import { useActivityLog, useActivityActors } from '@/lib/queries/activity-log';
import { ACTION_GROUPS, DATE_RANGES, sinceFromDays } from '@/lib/activity-display';
import { ActivityFeed } from './ActivityFeed';

export function ActivityLogView({ initialUserId = '' }: { initialUserId?: string }) {
  const [userId, setUserId] = useState(initialUserId);
  const [actionGroup, setActionGroup] = useState('');
  const [days, setDays] = useState('7');

  // Recomputed only when a filter changes, so the query key stays stable and
  // the feed does not refetch on every render.
  const filters = useMemo(
    () => ({
      userId: userId || undefined,
      actionGroup: actionGroup || undefined,
      since: sinceFromDays(days),
    }),
    [userId, actionGroup, days],
  );

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useActivityLog(filters);
  const { data: actors = [] } = useActivityActors();

  const entries = data?.pages.flat() ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select label="User" value={userId} onChange={setUserId}>
          <option value="">Everyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
          {/* Arriving from a user's page filters on someone the recent-actor
              list may not cover, and a select with no matching option shows
              blank. This keeps the filter honest about who it is showing. */}
          {userId && !actors.some((a) => a.id === userId) && (
            <option value={userId}>Selected user</option>
          )}
        </Select>

        <Select label="Action" value={actionGroup} onChange={setActionGroup}>
          {ACTION_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </Select>

        <Select label="Date" value={days} onChange={setDays}>
          {DATE_RANGES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </Select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'Could not load the activity log.'}
            </p>
          </div>
        ) : (
          <>
            <ActivityFeed entries={entries} />
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full h-11 border-t border-gray-100 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      {entries.length > 0 && (
        <p className="text-xs text-gray-400">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} shown
        </p>
      )}
    </div>
  );
}

function Select({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-gray-500">
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 sm:h-9 px-2 rounded-xl border border-gray-300 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {children}
      </select>
    </label>
  );
}
