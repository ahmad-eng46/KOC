import { createServerClient } from '@/lib/supabase/server';
import { type Role } from '@/lib/auth/permissions';

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('users')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!data || !data.is_active) return null;
  return data as SessionUser;
}
