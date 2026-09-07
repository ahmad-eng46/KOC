'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { getActiveBusinessId } from '@/lib/business';
import { logActivity } from '@/lib/actions/activity-log';
import { can, type Permission, type Role } from '@/lib/auth/permissions';
import { resolveEffective } from '@/lib/auth/effective';
import {
  resolvePageAccess, roleDefault, isLockedFor, isDeparture, type PageDefinition,
} from '@/lib/auth/page-access-rules';

type Result<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

const accessMapSchema = z.record(z.string().min(1), z.boolean());

/** One row of the admin's checklist: what the role gives, what was set, what results. */
export type ChecklistRow = {
  key: string;
  label: string;
  category: PageDefinition['category'];
  sortOrder: number;
  roleDefault: boolean;
  override: boolean | null;
  effective: boolean;
  /** Locked by the database for this role, so the checkbox is disabled. */
  locked: boolean;
  /** True when the permission system denies the underlying operation. */
  blockedByPermission: boolean;
};

export type UserChecklist = {
  userId: string;
  role: Role;
  isAdmin: boolean;
  rows: ChecklistRow[];
};

async function requireAdmin(): Promise<
  { ok: true; adminId: string; businessId: string } | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };
  if (session.role !== 'admin') return { ok: false, error: 'Admin only.' };
  try {
    return { ok: true, adminId: session.id, businessId: await getActiveBusinessId() };
  } catch {
    return { ok: false, error: 'No active business.' };
  }
}

async function loadPages(): Promise<PageDefinition[]> {
  const { data } = await adminClient
    .from('page_definitions')
    .select('*')
    .order('category')
    .order('sort_order');
  return (data ?? []) as unknown as PageDefinition[];
}

async function loadUserRole(userId: string): Promise<Role | null> {
  const { data } = await adminClient.from('users').select('role').eq('id', userId).single();
  return (data as { role: Role } | null)?.role ?? null;
}

// ─────────────────────────────────────────────
// 1. getUserPageAccessForAdmin — fills the checklist
// ─────────────────────────────────────────────
export async function getUserPageAccessForAdmin(
  userId: string,
): Promise<Result<UserChecklist>> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;

  const role = await loadUserRole(userId);
  if (!role) return { ok: false, error: 'User not found.' };

  const [pages, accessRows, permissionRows] = await Promise.all([
    loadPages(),
    adminClient
      .from('user_page_access')
      .select('page_key, is_allowed')
      .eq('user_id', userId)
      .eq('business_id', ctx.businessId),
    adminClient
      .from('user_permission_overrides')
      .select('permission, granted')
      .eq('user_id', userId)
      .eq('business_id', ctx.businessId),
  ]);

  const overrides = new Map(
    ((accessRows.data ?? []) as Array<{ page_key: string; is_allowed: boolean }>)
      .map((r) => [r.page_key, r.is_allowed]),
  );
  const permissionOverrides = new Map(
    ((permissionRows.data ?? []) as Array<{ permission: string; granted: boolean }>)
      .map((r) => [r.permission, r.granted]),
  );

  const rows: ChecklistRow[] = pages.map((page) => {
    const permissionAllowed = page.permission_key
      ? resolveEffective(
          can(role, page.permission_key as Permission),
          permissionOverrides.has(page.permission_key)
            ? permissionOverrides.get(page.permission_key)!
            : null,
        )
      : true;

    const override = overrides.has(page.key) ? overrides.get(page.key)! : null;

    return {
      key: page.key,
      label: page.label,
      category: page.category,
      sortOrder: page.sort_order,
      roleDefault: roleDefault(page, role),
      override,
      effective: resolvePageAccess({ role, page, override, permissionAllowed }),
      locked: isLockedFor(page, role),
      blockedByPermission: !!page.permission_key && !permissionAllowed,
    };
  });

  return { ok: true, data: { userId, role, isAdmin: role === 'admin', rows } };
}

// ─────────────────────────────────────────────
// 2. setUserPageAccess — save the whole checklist at once
// ─────────────────────────────────────────────
export async function setUserPageAccess(
  userId: string,
  accessMap: Record<string, boolean>,
): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;

  const parsed = accessMapSchema.safeParse(accessMap);
  if (!parsed.success) return { ok: false, error: 'Invalid access selection.' };

  const role = await loadUserRole(userId);
  if (!role) return { ok: false, error: 'User not found.' };

  // An admin always sees everything, so storing rows for one would be a lie the
  // resolver ignores anyway. Say so rather than writing rows that do nothing.
  if (role === 'admin') {
    return {
      ok: false,
      error: 'Admin users have full access to every page. Change their role first to restrict it.',
    };
  }

  const pages = await loadPages();
  const byKey = new Map(pages.map((p) => [p.key, p]));

  const rows: Array<{
    business_id: string; user_id: string; page_key: string;
    is_allowed: boolean; granted_by: string; updated_at: string;
  }> = [];
  /**
   * Ticks that agree with the role default are deleted, not written. A stored
   * row wins over the default forever — resolvePageAccess reads
   * `override ?? roleDefault` — so writing one for every page freezes the user
   * at the moment Save was pressed, and a later migration that widens the role
   * reaches everyone except the users an admin had bothered to configure.
   */
  const defaultKeys: string[] = [];
  const now = new Date().toISOString();

  for (const [key, allowed] of Object.entries(parsed.data)) {
    const page = byKey.get(key);
    if (!page) return { ok: false, error: `Unknown page "${key}".` };

    // The database refuses this too; catching it here gives a sentence the
    // admin can act on instead of a constraint name.
    if (allowed && isLockedFor(page, role)) {
      return {
        ok: false,
        error: `"${page.label}" is enforced by the database and cannot be granted to a ${role}.`,
      };
    }

    if (!isDeparture(page, role, allowed)) {
      defaultKeys.push(key);
      continue;
    }

    rows.push({
      business_id: ctx.businessId,
      user_id: userId,
      page_key: key,
      is_allowed: allowed,
      granted_by: ctx.adminId,
      updated_at: now,
    });
  }

  if (defaultKeys.length > 0) {
    const { error: clearError } = await adminClient
      .from('user_page_access')
      .delete()
      .eq('business_id', ctx.businessId)
      .eq('user_id', userId)
      .in('page_key', defaultKeys);
    if (clearError) return { ok: false, error: clearError.message };
  }

  if (rows.length === 0) return { ok: true };

  const { error } = await adminClient
    .from('user_page_access')
    .upsert(rows, { onConflict: 'business_id,user_id,page_key' });
  if (error) return { ok: false, error: error.message };

  const allowedLabels = rows
    .filter((r) => r.is_allowed)
    .map((r) => byKey.get(r.page_key)?.label ?? r.page_key);

  await logActivity({
    action: 'permission.changed',
    entityType: 'user',
    entityId: userId,
    description: `Set page access: ${allowedLabels.length} of ${rows.length} allowed`,
    metadata: { allowed: allowedLabels.length, total: rows.length },
  });

  revalidatePath('/settings/users');
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 3. resetToRoleDefaults — delete the departures
// ─────────────────────────────────────────────
export async function resetToRoleDefaults(userId: string): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;

  const role = await loadUserRole(userId);
  if (!role) return { ok: false, error: 'User not found.' };

  // Deleting the rows IS the reset: with none, the resolver falls back to the
  // role defaults, which is exactly what a user created today gets.
  const { error } = await adminClient
    .from('user_page_access')
    .delete()
    .eq('user_id', userId)
    .eq('business_id', ctx.businessId);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'permission.changed',
    entityType: 'user',
    entityId: userId,
    description: `Reset page access to the ${role} defaults`,
    metadata: { role },
  });

  revalidatePath('/settings/users');
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 4. listPageDefinitionsForAdmin — the master list, for a blank checklist on create
// ─────────────────────────────────────────────
export async function listPageDefinitionsForAdmin(): Promise<Result<PageDefinition[]>> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;
  return { ok: true, data: await loadPages() };
}

/** "7 of 12 pages" for every user on the list, in one pass rather than per row. */
export async function getAccessSummaries(): Promise<
  Result<Record<string, { allowed: number; total: number }>>
> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;

  const [pages, usersRes, accessRes, permissionRes] = await Promise.all([
    loadPages(),
    adminClient.from('users').select('id, role').is('deleted_at', null),
    adminClient.from('user_page_access').select('user_id, page_key, is_allowed')
      .eq('business_id', ctx.businessId),
    adminClient.from('user_permission_overrides').select('user_id, permission, granted')
      .eq('business_id', ctx.businessId),
  ]);

  const visiblePages = pages.filter((p) => p.category !== 'actions');
  const out: Record<string, { allowed: number; total: number }> = {};

  const accessByUser = new Map<string, Map<string, boolean>>();
  for (const r of (accessRes.data ?? []) as Array<{ user_id: string; page_key: string; is_allowed: boolean }>) {
    const m = accessByUser.get(r.user_id) ?? new Map<string, boolean>();
    m.set(r.page_key, r.is_allowed);
    accessByUser.set(r.user_id, m);
  }
  const permsByUser = new Map<string, Map<string, boolean>>();
  for (const r of (permissionRes.data ?? []) as Array<{ user_id: string; permission: string; granted: boolean }>) {
    const m = permsByUser.get(r.user_id) ?? new Map<string, boolean>();
    m.set(r.permission, r.granted);
    permsByUser.set(r.user_id, m);
  }

  for (const u of (usersRes.data ?? []) as Array<{ id: string; role: Role }>) {
    const overrides = accessByUser.get(u.id) ?? new Map<string, boolean>();
    const perms = permsByUser.get(u.id) ?? new Map<string, boolean>();

    const allowed = visiblePages.filter((page) => {
      const permissionAllowed = page.permission_key
        ? resolveEffective(
            can(u.role, page.permission_key as Permission),
            perms.has(page.permission_key) ? perms.get(page.permission_key)! : null,
          )
        : true;
      return resolvePageAccess({
        role: u.role,
        page,
        override: overrides.has(page.key) ? overrides.get(page.key)! : null,
        permissionAllowed,
      });
    }).length;

    out[u.id] = { allowed, total: visiblePages.length };
  }

  return { ok: true, data: out };
}
