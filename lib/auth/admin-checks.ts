import { createServerClient } from '@/lib/supabase/server';

/**
 * Number of currently active, non-deleted admins.
 * Used to enforce the "never demote/disable/delete the last admin" invariant.
 */
export async function countActiveAdmins(): Promise<number> {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('is_active', true)
    .is('deleted_at', null);
  return count ?? 0;
}

// ─────────────────────────────────────────────
// Pure validators — easy to unit-test, no DB.
// ─────────────────────────────────────────────

/** True if changing this user's role would remove the last active admin. */
export function demotionWouldRemoveLastAdmin(
  userIsCurrentlyAdmin: boolean,
  newRole: string,
  currentActiveAdminCount: number,
): boolean {
  if (!userIsCurrentlyAdmin) return false;
  if (newRole === 'admin') return false;
  return currentActiveAdminCount <= 1;
}

/** True if deactivating this user would remove the last active admin. */
export function deactivationWouldRemoveLastAdmin(
  userIsCurrentlyAdmin: boolean,
  userIsCurrentlyActive: boolean,
  currentActiveAdminCount: number,
): boolean {
  if (!userIsCurrentlyAdmin) return false;
  if (!userIsCurrentlyActive) return false;
  return currentActiveAdminCount <= 1;
}

/** True if deleting this user would remove the last active admin. */
export function deletionWouldRemoveLastAdmin(
  userIsCurrentlyAdmin: boolean,
  userIsCurrentlyActive: boolean,
  currentActiveAdminCount: number,
): boolean {
  // Same as deactivation — soft-delete sets is_active=false too.
  return deactivationWouldRemoveLastAdmin(
    userIsCurrentlyAdmin,
    userIsCurrentlyActive,
    currentActiveAdminCount,
  );
}
