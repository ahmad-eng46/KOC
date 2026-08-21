'use client';

import Link from 'next/link';
import { Bell, ArrowRight } from 'lucide-react';
import { relativeTime } from '@/lib/activity-display';
import { useDeletionRequests } from '@/lib/queries/deletion-requests';

/**
 * Dashboard card. Rendered for everyone: an admin sees what is waiting on them,
 * and everyone else sees their own requests still in flight — RLS decides which,
 * so one component serves both without a role prop that could drift from it.
 */
export function PendingApprovalsWidget({ isAdmin }: { isAdmin: boolean }) {
  const { data = [], error } = useDeletionRequests('pending');

  // Nothing waiting is the normal state; a card saying "0" every day is noise.
  if (error || data.length === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
          <Bell size={14} />
          {isAdmin ? 'Pending approvals' : 'Your deletion requests'}
          <span className="ml-1 px-1.5 rounded-full bg-amber-600 text-white text-xs tabular-nums">
            {data.length}
          </span>
        </h2>
        <Link
          href="/approvals"
          className="text-xs font-medium text-amber-800 hover:underline shrink-0 inline-flex items-center gap-1"
        >
          {isAdmin ? 'Review all' : 'View all'} <ArrowRight size={12} />
        </Link>
      </div>

      <ul className="divide-y divide-gray-100">
        {data.slice(0, 3).map((r) => (
          <li key={r.id} className="px-4 py-2.5">
            <p className="text-sm text-gray-900 truncate">{r.entity_display_name}</p>
            <p className="text-xs text-gray-500 truncate">
              {isAdmin ? `${r.requester_name} · ` : ''}
              {relativeTime(r.requested_at)} · “{r.reason}”
            </p>
          </li>
        ))}
      </ul>

      {data.length > 3 && (
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
          +{data.length - 3} more
        </p>
      )}
    </section>
  );
}
