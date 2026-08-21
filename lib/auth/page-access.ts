// Server-only: reads page definitions and per-user access, and answers the
// question every guard asks — may this user see this page?

import { createServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { getActiveBusinessId } from '@/lib/business';
import { can, type Permission, type Role } from '@/lib/auth/permissions';
import { resolveEffective } from '@/lib/auth/effective';
import {
  resolveAccessMap, resolvePageAccess, type PageDefinition,
} from '@/lib/auth/page-access-rules';

const PAGE_COLUMNS =
  'key, label, category, sort_order, description, default_admin, default_accountant, ' +
  'default_staff, default_viewer, is_lockable, permission_key';

export async function listPageDefinitions(): Promise<PageDefinition[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('page_definitions')
    .select(PAGE_COLUMNS)
    .order('category')
    .order('sort_order');

  if (error) return [];
  return (data ?? []) as unknown as PageDefinition[];
}

async function loadOverrides(
  userId: string,
  businessId: string,
): Promise<Map<string, boolean>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('user_page_access')
    .select('page_key, is_allowed')
    .eq('user_id', userId)
    .eq('business_id', businessId);

  if (error || !data) return new Map();
  return new Map(
    (data as Array<{ page_key: string; is_allowed: boolean }>).map((r) => [r.page_key, r.is_allowed]),
  );
}

/** The permission overrides from 0051, which page access may narrow but not widen. */
async function loadPermissionOverrides(
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
  return new Map(
    (data as Array<{ permission: string; granted: boolean }>).map((r) => [r.permission, r.granted]),
  );
}

/**
 * Every page's answer for one user, in three queries rather than one per page.
 * The sidebar renders on every navigation, so this is the shape that matters.
 */
export async function getUserPageAccessMap(
  userId: string,
  businessId: string,
  role: Role,
): Promise<Record<string, boolean>> {
  const [pages, pageOverrides, permissionOverrides] = await Promise.all([
    listPageDefinitions(),
    loadOverrides(userId, businessId),
    loadPermissionOverrides(userId, businessId),
  ]);

  const permissionAllows = (key: string) =>
    resolveEffective(
      can(role, key as Permission),
      permissionOverrides.has(key) ? permissionOverrides.get(key)! : null,
    );

  return resolveAccessMap(role, pages, pageOverrides, permissionAllows);
}

/** One page, for a route guard or a single button. */
export async function canAccessPage(
  userId: string,
  businessId: string,
  role: Role,
  pageKey: string,
): Promise<boolean> {
  // Short-circuited before any read: an admin sees everything, and the guard
  // should not depend on a table being reachable to say so.
  if (role === 'admin') return true;

  const [pages, pageOverrides, permissionOverrides] = await Promise.all([
    listPageDefinitions(),
    loadOverrides(userId, businessId),
    loadPermissionOverrides(userId, businessId),
  ]);

  const page = pages.find((p) => p.key === pageKey);
  // An unknown key is not a page this system governs, so it is not this
  // system's job to block it.
  if (!page) return true;

  const permissionAllowed = page.permission_key
    ? resolveEffective(
        can(role, page.permission_key as Permission),
        permissionOverrides.has(page.permission_key)
          ? permissionOverrides.get(page.permission_key)!
          : null,
      )
    : true;

  return resolvePageAccess({
    role,
    page,
    override: pageOverrides.has(pageKey) ? pageOverrides.get(pageKey)! : null,
    permissionAllowed,
  });
}

/** canAccessPage for whoever is signed in. False when nobody is. */
export async function currentUserCanAccess(pageKey: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (session.role === 'admin') return true;

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return false;

  return canAccessPage(session.id, businessId, session.role, pageKey);
}

/** The whole map for the signed-in user, for the app shell. */
export async function currentUserAccessMap(): Promise<Record<string, boolean>> {
  const session = await getSession();
  if (!session) return {};

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return {};

  return getUserPageAccessMap(session.id, businessId, session.role);
}
