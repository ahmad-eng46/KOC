'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import { logActivity } from '@/lib/actions/activity-log';
import { getActiveBusinessId } from '@/lib/business';
import {
  ALL_PERMISSIONS, UNOVERRIDABLE, type Permission, type Role,
} from '@/lib/auth/permissions';
import {
  buildPermissionRows, effectivePermissionSet, type PermissionRow,
} from '@/lib/auth/effective';

type Result<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

const permissionSchema = z
  .string()
  .refine((v): v is Permission => (ALL_PERMISSIONS as string[]).includes(v), 'Unknown permission')
  .refine((v) => !(UNOVERRIDABLE as readonly string[]).includes(v), 'This permission cannot be overridden');

const setOverrideSchema = z.object({
  userId: z.string().min(1),
  permission: permissionSchema,
  granted: z.boolean(),
  notes: z.string().max(500).optional(),
});

async function requireAdminContext(): Promise<
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

async function getUserRole(userId: string): Promise<Role | null> {
  const { data } = await adminClient.from('users').select('role').eq('id', userId).single();
  return (data as { role: Role } | null)?.role ?? null;
}

async function loadOverrideMap(userId: string, businessId: string): Promise<Map<string, boolean>> {
  const { data } = await adminClient
    .from('user_permission_overrides')
    .select('permission, granted')
    .eq('user_id', userId)
    .eq('business_id', businessId);
  return new Map(
    ((data ?? []) as Array<{ permission: string; granted: boolean }>).map((r) => [r.permission, r.granted]),
  );
}

// ─────────────────────────────────────────────
// 1. getPermissionMatrix — every permission with role default, override, effect
// ─────────────────────────────────────────────
export type PermissionMatrix = {
  userId: string;
  role: Role;
  businessId: string;
  rows: PermissionRow[];
};

export async function getPermissionMatrix(userId: string): Promise<Result<PermissionMatrix>> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return ctx;

  const role = await getUserRole(userId);
  if (!role) return { ok: false, error: 'User not found.' };

  const overrides = await loadOverrideMap(userId, ctx.businessId);
  return {
    ok: true,
    data: {
      userId,
      role,
      businessId: ctx.businessId,
      rows: buildPermissionRows(role, ALL_PERMISSIONS, overrides),
    },
  };
}

// ─────────────────────────────────────────────
// 2. setPermissionOverride
// ─────────────────────────────────────────────
export async function setPermissionOverride(
  userId: string,
  permission: string,
  granted: boolean,
  notes?: string,
): Promise<Result> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return ctx;

  const parsed = setOverrideSchema.safeParse({ userId, permission, granted, notes });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // An admin who removes their own last permission would lock the business out
  // of its own settings. Role changes are the supported way to demote someone.
  if (userId === ctx.adminId && !granted) {
    return { ok: false, error: 'You cannot deny a permission to yourself. Ask another admin.' };
  }

  const { error } = await adminClient
    .from('user_permission_overrides')
    .upsert(
      {
        business_id: ctx.businessId,
        user_id: userId,
        permission: parsed.data.permission,
        granted: parsed.data.granted,
        granted_by: ctx.adminId,
        granted_at: new Date().toISOString(),
        notes: parsed.data.notes ?? null,
      },
      { onConflict: 'business_id,user_id,permission' },
    );
  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'permission.changed',
    entityType: 'user',
    entityId: userId,
    description: `${granted ? 'Granted' : 'Denied'} "${parsed.data.permission}" for a user`,
    metadata: { permission: parsed.data.permission, granted },
  });

  revalidatePath('/settings/users');
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 3. removePermissionOverride — back to the role default
// ─────────────────────────────────────────────
export async function removePermissionOverride(
  userId: string,
  permission: string,
): Promise<Result> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return ctx;

  const { error } = await adminClient
    .from('user_permission_overrides')
    .delete()
    .eq('business_id', ctx.businessId)
    .eq('user_id', userId)
    .eq('permission', permission);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    action: 'permission.changed',
    entityType: 'user',
    entityId: userId,
    description: `Reset "${permission}" to the role default for a user`,
    metadata: { permission, granted: null },
  });

  revalidatePath('/settings/users');
  revalidatePath(`/settings/users/${userId}`);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 4. getUserEffectivePermissions
// ─────────────────────────────────────────────
export async function getUserEffectivePermissions(userId: string): Promise<Result<Permission[]>> {
  const ctx = await requireAdminContext();
  if (!ctx.ok) return ctx;

  const role = await getUserRole(userId);
  if (!role) return { ok: false, error: 'User not found.' };

  const overrides = await loadOverrideMap(userId, ctx.businessId);
  return { ok: true, data: effectivePermissionSet(role, ALL_PERMISSIONS, overrides) };
}
