'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBusinessStore } from '@/lib/store/business';
import {
  getStaffNotifications,
  markNotificationsSeen,
  type NotificationFeed,
} from '@/lib/actions/notifications';

const FEED_KEY = 'staff-notifications';

/**
 * Polled rather than pushed. Supabase Realtime is available, but a subscription
 * per admin per tab to learn about a handful of events a day is not worth the
 * connection; a minute of latency on "staff added a product" costs nobody
 * anything.
 */
export function useStaffNotifications(enabled: boolean) {
  const activeId = useBusinessStore((s) => s.activeId);
  return useQuery<NotificationFeed>({
    queryKey: [FEED_KEY, activeId],
    enabled: enabled && !!activeId,
    queryFn: () => getStaffNotifications(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useMarkNotificationsSeen() {
  const queryClient = useQueryClient();
  const activeId = useBusinessStore((s) => s.activeId);

  return useMutation({
    mutationFn: () => markNotificationsSeen(),
    onSuccess: (result) => {
      if (!result.ok) return;
      queryClient.invalidateQueries({ queryKey: [FEED_KEY, activeId] });
    },
  });
}
