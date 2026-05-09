import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { type Role } from '@/lib/auth/permissions';

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
    redirect('/unauthorized');
  }

  return { user, profile };
}
