// Server-only: imports next/headers via createServerClient and lib/business.
import { createServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { getActiveBusinessId } from '@/lib/business';
import { can, type Permission, type Role } from '@/lib/auth/permissions';
import { resolveEffective, type OverrideValue } from '@/lib/auth/effective';

/**
 * Role permission plus this user's overrides. `can(role, permission)` is still
 * the right call anywhere only the role is known (the sidebar's first paint,
 * pure helpers); this is the one to reach for on the server, where the user is.
 *
 * A failed override lookup falls back to the role default rather than denying —
 * a database hiccup must not lock an accountant out of the ledger.
 */
export async function canUser(
  userId: string,
  businessId: string,
  role: Role,
  permission: Permission,
): Promise<boolean> {
  const roleDefault = can(role, permission);
  const override = await getOverride(userId, businessId, permission);
  return resolveEffective(roleDefault, override);
}

/** canUser() for whoever is signed in right now. False when nobody is. */
export async function currentUserCan(permission: Permission): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  let businessId: string;
  try {
    businessId = await getActiveBusinessId();
  } catch {
    return false;
  }

  return canUser(session.id, businessId, session.role, permission);
}

async function getOverride(
  userId: string,
  businessId: string,
  permission: Permission,
): Promise<OverrideValue> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('user_permission_overrides')
    .select('granted')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .eq('permission', permission)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { granted: boolean }).granted;
}

/**
 * Every override for one user in one business, as a permission → granted map.
 * One round trip, for callers that need to resolve many permissions at once
 * (the sidebar, the permissions matrix).
 */
export async function loadOverrides(
  userId: string,
  businessId: string,
): Promise<Map<string, boolean>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('user_permission_overrides')
    .select('permission, granted')
    .eq('user_id', userId)
    .eq('business_id', businessId);

  if (error || !data) return new Map();
  return new Map((data as Array<{ permission: string; granted: boolean }>).map((r) => [r.permission, r.granted]));
}
