'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { useAuditFeed, useActivityActors } from '@/lib/queries/activity-log';
import { useMarkNotificationsSeen } from '@/lib/queries/notifications';
import {
  ACTION_GROUPS, AUDIT_ENTITY_TYPES, DATE_RANGES,
  sinceFromDays, relativeTime, activityHref, userColor,
} from '@/lib/activity-display';
import { formatPKR } from '@/lib/money';
import type { AuditEntry } from '@/lib/actions/activity-log';

/**
 * What happened in this business, the admin's own actions included.
 *
 * This is the half the notification bell deliberately leaves out. The bell
 * answers "what did staff do that I should look at?" and so filters admins
 * away; an audit trail that quietly omits whoever is reading it is not an
 * audit trail. Same rows, same store — a second question asked of it (0076).
 *
 * Append-only is a property of activity_log, not of this screen: its INSERT,
 * UPDATE and DELETE policies are all refused through the API, so there is
 * nothing here to edit and no edit button to withhold.
 */
export function AuditFeedView() {
  const [userId, setUserId] = useState('');
  const [actionGroup, setActionGroup] = useState('');
  const [entityType, setEntityType] = useState('');
  const [days, setDays] = useState('7');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const filters = useMemo(
    () => ({
      userId: userId || undefined,
      actionGroup: actionGroup || undefined,
      entityType: entityType || undefined,
      since: sinceFromDays(days),
      unreadOnly: unreadOnly || undefined,
    }),
    [userId, actionGroup, entityType, days, unreadOnly],
  );

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuditFeed(filters);
  const { data: actors = [] } = useActivityActors();
  const markSeen = useMarkNotificationsSeen();

  const entries = data?.pages.flat() ?? [];
  const unreadShown = entries.filter((e) => e.is_unread).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="User" value={userId} onChange={setUserId}>
          <option value="">Everyone</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>

        <Select label="Action" value={actionGroup} onChange={setActionGroup}>
          {ACTION_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </Select>

        <Select label="Record" value={entityType} onChange={setEntityType}>
          {AUDIT_ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>

        <Select label="Date" value={days} onChange={setDays}>
          {DATE_RANGES.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </Select>

        <label className="inline-flex items-center gap-2 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Unread only
        </label>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => markSeen.mutate()}
          disabled={markSeen.isPending || unreadShown === 0}
          className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Check size={14} />
          {markSeen.isPending ? 'Marking…' : 'Mark all as read'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'Could not load the audit log.'}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">
            Nothing recorded in this period.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-gray-100">
              {entries.map((e) => (
                <AuditRow key={e.id} entry={e} />
              ))}
            </ul>
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
          {unreadShown > 0 && ` · ${unreadShown} unread`}
        </p>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const href = activityHref(entry.entity_type, entry.entity_id);
  const hasMovement =
    entry.old_value_paisa !== null && entry.new_value_paisa !== null
    && entry.old_value_paisa !== entry.new_value_paisa;

  const body = (
    <div className="flex items-start gap-3">
      {entry.is_unread ? (
        <Circle size={8} className="mt-1.5 shrink-0 fill-blue-600 text-blue-600" aria-label="Unread" />
      ) : (
        <span
          className={['mt-1.5 w-2 h-2 rounded-full shrink-0', userColor(entry.actor_id)].join(' ')}
          aria-hidden
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">{entry.actor_name}</span>
          {entry.actor_role && <span className="text-gray-400"> ({entry.actor_role})</span>}
          {' · '}
          {relativeTime(entry.created_at)}
        </p>

        <p className={['text-sm mt-0.5', entry.is_unread ? 'text-gray-900 font-medium' : 'text-gray-900'].join(' ')}>
          {entry.description}
        </p>

        {hasMovement && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums">
            <span className="text-gray-500 line-through">{formatPKR(entry.old_value_paisa ?? 0)}</span>
            <ArrowRight size={12} className="text-gray-400 shrink-0" />
            <span className="font-medium text-gray-900">{formatPKR(entry.new_value_paisa ?? 0)}</span>
            {entry.difference_paisa !== null && entry.difference_paisa !== 0 && (
              <span className={entry.difference_paisa > 0 ? 'text-red-700' : 'text-green-700'}>
                ({entry.difference_paisa > 0 ? '+' : '−'}
                {formatPKR(Math.abs(entry.difference_paisa), { showSymbol: false })})
              </span>
            )}
          </div>
        )}

        {entry.reason && (
          <p className="mt-1 text-xs text-gray-600 italic">&ldquo;{entry.reason}&rdquo;</p>
        )}
      </div>
    </div>
  );

  return (
    <li className={entry.is_unread ? 'bg-blue-50/40' : ''}>
      {href ? (
        <Link href={href} className="block px-4 py-3 hover:bg-gray-50">{body}</Link>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
    </li>
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
