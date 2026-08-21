'use client';

import { Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { usePendingEntityIds } from '@/lib/queries/deletion-requests';
import type { DeletableEntity } from '@/lib/validators/deletion-requests';

/**
 * Small marker on a list row. Answers the question a requester asks the moment
 * they file: "I asked for this to be deleted — why is it still here?"
 */
export function PendingDeleteBadge({
  entityType, entityId,
}: {
  entityType: DeletableEntity;
  entityId: string;
}) {
  const { data = {} } = usePendingEntityIds(entityType);
  const pending = data[entityId];
  if (!pending) return null;

  return (
    <span
      title={`Deletion requested by ${pending.requester} — waiting for admin approval`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700"
    >
      <Clock size={10} />
      Pending delete
    </span>
  );
}

/** Full-width banner for a detail page, where there is room to say who and when. */
export function PendingDeleteBanner({
  entityType, entityId,
}: {
  entityType: DeletableEntity;
  entityId: string;
}) {
  const { data = {} } = usePendingEntityIds(entityType);
  const pending = data[entityId];
  if (!pending) return null;

  const when = pending.requestedAt
    ? format(parseISO(pending.requestedAt), 'dd MMM yyyy')
    : null;

  return (
    <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 flex items-start gap-2">
      <Clock size={16} className="text-orange-600 shrink-0 mt-0.5" />
      <p className="text-sm text-orange-800">
        Deletion requested by <span className="font-medium">{pending.requester}</span>
        {when ? ` on ${when}` : ''} — waiting for admin approval.
      </p>
    </div>
  );
}
