'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/auth/session';
import {
  countActiveAdmins,
  demotionWouldRemoveLastAdmin,
  deactivationWouldRemoveLastAdmin,
  deletionWouldRemoveLastAdmin,
} from '@/lib/auth/admin-checks';
import {
  userCreateSchema,
  userUpdateSchema,
  passwordResetSchema,
  ownPasswordChangeSchema,
  ownProfileSchema,
  softDeleteSchema,
  type UserCreateInput,
  type UserUpdateInput,
} from '@/lib/validators/user';

type Result<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; userId: string; email: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };
  if (session.role !== 'admin') return { ok: false, error: 'Admin only.' };
  return { ok: true, userId: session.id, email: session.email };
}

async function logAuthAudit(
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  rowId: string,
  actorId: string,
  before: unknown,
  after: unknown,
) {
  // Use service role so we can write directly to audit_log even if RLS would block.
  const admin = adminClient;
  await admin.from('audit_log').insert({
    user_id: actorId,
    table_name: 'auth.users',
    row_id: rowId,
    action,
    before_jsonb: before ?? null,
    after_jsonb: after ?? null,
  });
}

async function setUserBusinesses(userId: string, businessIds: string[]) {
  const admin = adminClient;
  // Replace: delete then insert. Acceptable atomicity since this is admin-only and idempotent.
  await admin.from('user_businesses').delete().eq('user_id', userId);
  if (businessIds.length > 0) {
    await admin
      .from('user_businesses')
      .insert(businessIds.map((bid) => ({ user_id: userId, business_id: bid })));
  }
}

// ─────────────────────────────────────────────
// 1. createUser
// ─────────────────────────────────────────────
export async function createUser(input: UserCreateInput): Promise<Result<{ userId: string }>> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const admin = adminClient;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.fullName,
      phone: data.phone || null,
      role: data.role,
    },
  });
  if (error || !created.user) return { ok: false, error: error?.message ?? 'Auth create failed.' };

  const newId = created.user.id;

  // Trigger fires automatically and inserts into public.users.
  // Apply business assignments + ensure phone landed even if trigger missed it.
  await admin
    .from('users')
    .update({ phone: data.phone || null, full_name: data.fullName, role: data.role })
    .eq('id', newId);

  await setUserBusinesses(newId, data.businessIds);

  await logAuthAudit('INSERT', newId, adminCheck.userId, null, {
    email: data.email,
    role: data.role,
    businesses: data.businessIds.length,
  });

  revalidatePath('/settings/users');
  return { ok: true, data: { userId: newId } };
}

// ─────────────────────────────────────────────
// 2. updateUser
// ─────────────────────────────────────────────
export async function updateUser(id: string, input: UserUpdateInput): Promise<Result> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  if (id === adminCheck.userId && input.role !== undefined) {
    return { ok: false, error: 'You cannot change your own role. Ask another admin.' };
  }

  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  const admin = adminClient;
  const { data: existing } = await admin
    .from('users')
    .select('id, role, is_active, full_name, phone')
    .eq('id', id)
    .single();
  if (!existing) return { ok: false, error: 'User not found.' };

  const adminCount = await countActiveAdmins();

  if (data.role !== undefined && demotionWouldRemoveLastAdmin(existing.role === 'admin', data.role, adminCount)) {
    return { ok: false, error: 'Cannot demote: this is the only active admin.' };
  }
  if (
    data.isActive === false &&
    deactivationWouldRemoveLastAdmin(existing.role === 'admin', existing.is_active, adminCount)
  ) {
    return { ok: false, error: 'Cannot disable: this is the only active admin.' };
  }

  const updates: Record<string, unknown> = {};
  if (data.fullName !== undefined) updates.full_name = data.fullName;
  if (data.phone !== undefined) updates.phone = data.phone || null;
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.is_active = data.isActive;

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await admin.from('users').update(updates).eq('id', id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  // If role changed, mirror into auth.users.user_metadata so future trigger reads stay correct.
  if (data.role !== undefined && data.role !== existing.role) {
    await admin.auth.admin.updateUserById(id, {
      user_metadata: { role: data.role, full_name: data.fullName ?? existing.full_name, phone: data.phone ?? existing.phone },
    });
    await logAuthAudit('UPDATE', id, adminCheck.userId, { role: existing.role }, { role: data.role });
  }

  // If isActive=false, sign them out so the change is immediate.
  if (data.isActive === false && existing.is_active) {
    await admin.auth.admin.signOut(id, 'global').catch(() => {});
    await logAuthAudit('UPDATE', id, adminCheck.userId, { is_active: true }, { is_active: false, action: 'force_signout' });
  }

  if (data.businessIds !== undefined) {
    await setUserBusinesses(id, data.businessIds);
  }

  revalidatePath('/settings/users');
  revalidatePath(`/settings/users/${id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────
// 3. resetUserPassword
// ─────────────────────────────────────────────
export async function resetUserPassword(id: string, newPassword: string): Promise<Result> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  const parsed = passwordResetSchema.safeParse({ newPassword });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = adminClient;
  const { error } = await admin.auth.admin.updateUserById(id, { password: parsed.data.newPassword });
  if (error) return { ok: false, error: error.message };

  await logAuthAudit('UPDATE', id, adminCheck.userId, null, { action: 'password_reset' });
  // Force sign-out so any existing sessions die.
  await admin.auth.admin.signOut(id, 'global').catch(() => {});
  return { ok: true };
}

// ─────────────────────────────────────────────
// 4. softDeleteUser
// ─────────────────────────────────────────────
export async function softDeleteUser(id: string, reason: string): Promise<Result> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  if (id === adminCheck.userId) return { ok: false, error: 'You cannot delete yourself.' };

  const parsed = softDeleteSchema.safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = adminClient;
  const { data: existing } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', id)
    .single();
  if (!existing) return { ok: false, error: 'User not found.' };

  const adminCount = await countActiveAdmins();
  if (deletionWouldRemoveLastAdmin(existing.role === 'admin', existing.is_active, adminCount)) {
    return { ok: false, error: 'Cannot delete: this is the only active admin.' };
  }

  const { error } = await admin
    .from('users')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  // Ban via Auth so existing sessions die and login is blocked.
  // ban_duration accepts a Postgres interval string; '876000h' is ~100 years.
  await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' }).catch(() => {});
  await admin.auth.admin.signOut(id, 'global').catch(() => {});

  await logAuthAudit('DELETE', id, adminCheck.userId, { is_active: existing.is_active }, { soft_deleted: true, reason: parsed.data.reason });

  revalidatePath('/settings/users');
  return { ok: true };
}

// ─────────────────────────────────────────────
// 5. restoreUser
// ─────────────────────────────────────────────
export async function restoreUser(id: string): Promise<Result> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  const admin = adminClient;
  const { error } = await admin
    .from('users')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  // Unban: ban_duration: 'none' per Supabase docs.
  await admin.auth.admin.updateUserById(id, { ban_duration: 'none' }).catch(() => {});

  await logAuthAudit('UPDATE', id, adminCheck.userId, { soft_deleted: true }, { restored: true });

  revalidatePath('/settings/users');
  return { ok: true };
}

// ─────────────────────────────────────────────
// 6. listUsersWithBusinesses (admin only)
// ─────────────────────────────────────────────
export type UserListRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: 'admin' | 'accountant' | 'staff' | 'viewer';
  is_active: boolean;
  deleted_at: string | null;
  last_login_at: string | null;
  created_at: string;
  businesses: Array<{ id: string; name: string }>;
};

export async function listUsersWithBusinesses(includeDeleted = false): Promise<
  Result<UserListRow[]>
> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  const admin = adminClient;
  let q = admin
    .from('users')
    .select(
      'id, email, full_name, phone, role, is_active, deleted_at, last_login_at, created_at, user_businesses(business_id, businesses(id, name))',
    )
    .order('created_at', { ascending: false });
  if (!includeDeleted) q = q.is('deleted_at', null);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  type RawBiz = { id: string; name: string };
  type RawUB = { business_id: string; businesses: RawBiz | RawBiz[] | null };
  type Raw = Omit<UserListRow, 'businesses'> & { user_businesses: RawUB[] | null };

  const rows = (data as unknown as Raw[]).map((u) => {
    const businesses = (u.user_businesses ?? [])
      .map((ub) => (Array.isArray(ub.businesses) ? ub.businesses[0] : ub.businesses))
      .filter((b): b is RawBiz => !!b);
    return {
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      phone: u.phone,
      role: u.role,
      is_active: u.is_active,
      deleted_at: u.deleted_at,
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      businesses,
    };
  });

  return { ok: true, data: rows };
}

// ─────────────────────────────────────────────
// 7. getUserLoginHistory — best-effort
//    Tries auth.sessions (service role can read it).
//    Falls back to empty array if blocked.
// ─────────────────────────────────────────────
export type LoginHistoryRow = {
  session_id: string;
  signed_in_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
};

export async function getUserLoginHistory(
  id: string,
  limit = 50,
): Promise<Result<LoginHistoryRow[]>> {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck;

  const admin = adminClient;
  // auth.sessions is in the auth schema; service role can read it via the JS client
  // by setting db.schema, but the public PostgREST API only exposes 'public'.
  // We use a SECURITY DEFINER RPC to expose it safely. If that's not in place,
  // fall back to last_login_at on public.users (one row).
  const { data, error } = await admin.rpc('user_login_history', { p_user_id: id, p_limit: limit });
  if (error) {
    // Fallback: return one synthetic row from public.users.last_login_at
    const { data: u } = await admin.from('users').select('last_login_at').eq('id', id).single();
    if (u?.last_login_at) {
      return {
        ok: true,
        data: [{
          session_id: 'last-known',
          signed_in_at: u.last_login_at,
          refreshed_at: null,
          user_agent: null,
          ip: null,
        }],
      };
    }
    return { ok: true, data: [] };
  }
  return { ok: true, data: (data ?? []) as LoginHistoryRow[] };
}

// ─────────────────────────────────────────────
// 8. changeOwnPassword (any role)
// ─────────────────────────────────────────────
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const parsed = ownPasswordChangeSchema.safeParse({ currentPassword, newPassword });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Verify current password by attempting a fresh sign-in via the public REST API
  // (this does NOT touch the user's existing session because we don't persist).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const verify = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: session.email, password: parsed.data.currentPassword }),
  });
  if (!verify.ok) return { ok: false, error: 'Current password is incorrect.' };

  const admin = adminClient;
  const { error } = await admin.auth.admin.updateUserById(session.id, {
    password: parsed.data.newPassword,
  });
  if (error) return { ok: false, error: error.message };

  await logAuthAudit('UPDATE', session.id, session.id, null, { action: 'self_password_change' });
  return { ok: true };
}

// ─────────────────────────────────────────────
// 9. updateOwnProfile (any role)
// ─────────────────────────────────────────────
export async function updateOwnProfile(input: { fullName?: string; phone?: string }): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const parsed = ownProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const updates: Record<string, unknown> = {};
  if (parsed.data.fullName !== undefined) updates.full_name = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone || null;
  if (Object.keys(updates).length === 0) return { ok: true };

  const supabase = await createServerClient();
  const { error } = await supabase.from('users').update(updates).eq('id', session.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/profile');
  return { ok: true };
}
