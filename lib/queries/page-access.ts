'use client';

import { useQuery } from '@tanstack/react-query';
import { useBusinessStore } from '@/lib/store/business';
import {
  listPageDefinitionsForAdmin, getUserPageAccessForAdmin, getAccessSummaries,
} from '@/lib/actions/page-access';
import type { PageDefinition } from '@/lib/auth/page-access-rules';

/** The master list. Stable enough to cache for the session. */
export function usePageDefinitions() {
  return useQuery<PageDefinition[]>({
    queryKey: ['page-definitions'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await listPageDefinitionsForAdmin();
      return r.ok ? r.data : [];
    },
  });
}

export function useUserPageAccess(userId: string | null) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery({
    queryKey: ['user-page-access', activeId, userId],
    enabled: !!userId && !!activeId,
    queryFn: async () => {
      const r = await getUserPageAccessForAdmin(userId!);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

/** "7 of 12 pages" for every user at once, rather than a query per row. */
export function useAccessSummaries() {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery<Record<string, { allowed: number; total: number }>>({
    queryKey: ['access-summaries', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const r = await getAccessSummaries();
      return r.ok ? r.data : {};
    },
  });
}
