'use client';

import Link from 'next/link';
import type { ActivityEntry } from '@/lib/actions/activity-log';
import { userColor, relativeTime, activityHref } from '@/lib/activity-display';

export function ActivityFeed({
  entries,
  showUser = true,
  compact = false,
}: {
  entries: ActivityEntry[];
  showUser?: boolean;
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">Nothing recorded yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {entries.map((e) => (
        <ActivityRow key={e.id} entry={e} showUser={showUser} compact={compact} />
      ))}
    </ul>
  );
}

function ActivityRow({
  entry, showUser, compact,
}: {
  entry: ActivityEntry;
  showUser: boolean;
  compact: boolean;
}) {
  const href = activityHref(entry.entity_type, entry.entity_id);

  const body = (
    <div className="flex items-start gap-3">
      <span
        className={['mt-1.5 w-2 h-2 rounded-full shrink-0', userColor(entry.user_id)].join(' ')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {showUser && (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{entry.user_name}</span>
            {' · '}
            {relativeTime(entry.created_at)}
          </p>
        )}
        <p className={['text-gray-900', compact ? 'text-xs' : 'text-sm', showUser ? 'mt-0.5' : ''].join(' ')}>
          {entry.description}
        </p>
        {!showUser && (
          <p className="text-xs text-gray-500 mt-0.5">{relativeTime(entry.created_at)}</p>
        )}
      </div>
    </div>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className="block px-4 py-3 hover:bg-gray-50 min-h-11">
          {body}
        </Link>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
    </li>
  );
}
