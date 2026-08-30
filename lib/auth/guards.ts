import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { type Permission, type Role } from '@/lib/auth/permissions';
import { buildDenialQuery } from '@/lib/auth/denial';
import { currentUserCan } from '@/lib/auth/can-user';

export async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, role, full_name, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) {
    redirect('/login');
  }

  return { user, profile };
}

export async function requireRole(...roles: Role[]) {
  const { user, profile } = await requireAuth();

  if (!roles.includes(profile.role as Role)) {
    // The path comes from the header proxy.ts sets; a server component cannot
    // read its own URL, and /unauthorized is useless if it cannot say what was
    // being asked for.
    const path = (await headers()).get('x-pathname');
    redirect(buildDenialQuery({ reason: 'role', required: roles.join(','), path }));
  }

  return { user, profile };
}

/**
 * Gate a page on the operation it performs rather than on a role list. Prefer
 * this over requireRole for anything that has a permission key: it is the same
 * answer the server action and the sidebar reach, so the three cannot drift,
 * and a per-user override actually takes effect.
 */
export async function requirePermission(permission: Permission) {
  const { user, profile } = await requireAuth();

  if (!(await currentUserCan(permission))) {
    const path = (await headers()).get('x-pathname');
    redirect(buildDenialQuery({ reason: 'permission', required: permission, path }));
  }

  return { user, profile };
}
