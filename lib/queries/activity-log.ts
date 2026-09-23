'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  listActivity, listActivityActors, listAuditFeed,
  type ActivityEntry, type ActivityFilters, type AuditFilters,
} from '@/lib/actions/activity-log';
import { useBusinessStore } from '@/lib/store/business';

const PAGE_SIZE = 50;

export function useActivityLog(filters: Omit<ActivityFilters, 'limit' | 'offset'> = {}) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useInfiniteQuery({
    queryKey: ['activity-log', activeId, filters],
    initialPageParam: 0,
    enabled: !!activeId,
    queryFn: async ({ pageParam }) => {
      const r = await listActivity({ ...filters, limit: PAGE_SIZE, offset: pageParam });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    // A short page means the end; anything else and there may be more.
    getNextPageParam: (last, all) =>
      last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE,
  });
}

/** Flat list, newest first, for the compact widgets. */
export function useRecentActivity(limit: number, filters: ActivityFilters = {}) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery<ActivityEntry[]>({
    queryKey: ['activity-recent', activeId, limit, filters],
    enabled: !!activeId,
    queryFn: async () => {
      const r = await listActivity({ ...filters, limit });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

export function useUserActivity(userId: string, limit = 20) {
  return useRecentActivity(limit, { userId });
}

export function useEntityActivity(entityType: string, entityId: string) {
  return useRecentActivity(50, { entityType, entityId });
}

export function useActivityActors() {
  const activeId = useBusinessStore((s) => s.activeId);

  return useQuery({
    queryKey: ['activity-actors', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const r = await listActivityActors();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

/**
 * The admin audit feed (0076). Kept beside the activity hooks because it reads
 * the same rows through a different view — separate cache keys, so filtering
 * one screen never disturbs the other.
 */
export function useAuditFeed(filters: Omit<AuditFilters, 'limit' | 'offset'> = {}) {
  const activeId = useBusinessStore((s) => s.activeId);

  return useInfiniteQuery({
    queryKey: ['audit-feed', activeId, filters],
    initialPageParam: 0,
    enabled: !!activeId,
    queryFn: async ({ pageParam }) => {
      const r = await listAuditFeed({ ...filters, limit: PAGE_SIZE, offset: pageParam });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    getNextPageParam: (last, all) =>
      last.length < PAGE_SIZE ? undefined : all.length * PAGE_SIZE,
  });
}

/**
 * The balance corrections made against one party.
 *
 * Read from activity_log rather than from the ledger, because the ledger entry
 * says what changed while the audit row says who changed it and why — and the
 * point of showing this on the party's own page is that anyone looking at the
 * account can see it was corrected by hand, by whom.
 */
export function usePartyAdjustments(entityType: 'customer' | 'supplier', entityId: string) {
  return useRecentActivity(50, { entityType, entityId, action: 'balance.adjusted' });
}
