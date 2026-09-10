'use server';

import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';

/**
 * The admin's feed of what staff did. Read-only by nature: everything here has
 * already happened. Approval lives in deletion_requests and nowhere else.
 */
export type StaffNotification = {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  created_at: string;
  is_unread: boolean;
  /** Action-specific detail. Rate overrides carry below_cost here. */
  metadata: Record<string, unknown> | null;
};

export type NotificationFeed = {
  items: StaffNotification[];
  unread: number;
};

const FEED_LIMIT = 30;

const EMPTY: NotificationFeed = { items: [], unread: 0 };

/**
 * One round trip for the marker and one for the lines. The unread count is
 * derived from the same rows that are displayed rather than counted separately,
 * so the badge can never disagree with the list under it.
 *
 * A count is capped at what was fetched: past FEED_LIMIT unread the exact
 * number stops being information anyone acts on, and the UI renders "30+".
 */
export async function getStaffNotifications(): Promise<NotificationFeed> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return EMPTY;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return EMPTY;

  const supabase = await createServerClient();

  const [feedRes, markerRes] = await Promise.all([
    supabase
      .from('staff_activity_notifications')
      .select(
        'id, actor_id, actor_name, actor_role, action, entity_type, entity_id, description, created_at, metadata',
      )
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from('notification_reads')
      .select('last_seen_at')
      .eq('user_id', session.id)
      .eq('business_id', businessId)
      .maybeSingle(),
  ]);

  if (feedRes.error) return EMPTY;

  // No marker yet means this admin has never had one. Treating that as
  // "everything is unread" would greet them with a badge counting every staff
  // action since the log began, the first time they sign in after deploy. So
  // the marker is seeded at now and only what happens next is news. Seeded here
  // rather than left null, because a null marker that means "all read" would
  // stay null forever and they would never be told anything.
  const lastSeen = markerRes.data?.last_seen_at ?? null;
  if (lastSeen === null) {
    await seedMarker(session.id, businessId);
    return { items: [], unread: 0 };
  }

  // Parsed, not compared as strings: Postgres returns '…+00:00' and toISOString
  // writes '…Z', so lexicographic order between the two is meaningless.
  const seenAt = new Date(lastSeen).getTime();

  const items: StaffNotification[] = (feedRes.data ?? []).map((row) => ({
    ...row,
    is_unread: new Date(row.created_at).getTime() > seenAt,
  }));

  return { items, unread: items.filter((i) => i.is_unread).length };
}

/** Moves this admin's high-water mark to now. Their own row, always. */
export async function markNotificationsSeen(): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { ok: false };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      { user_id: session.id, business_id: businessId, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,business_id' },
    );

  return { ok: !error };
}

/**
 * First marker for an admin who has none. Ignores conflicts: two tabs opening
 * at once is a race with no wrong outcome, and a failure here only means the
 * next read tries again.
 */
async function seedMarker(userId: string, businessId: string): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from('notification_reads')
    .upsert(
      { user_id: userId, business_id: businessId, last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,business_id', ignoreDuplicates: true },
    );
}
