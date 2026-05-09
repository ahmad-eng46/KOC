import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';

export const BUSINESS_COOKIE = 'active_business_id';

export type Business = {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
};

// ─────────────────────────────────────────────
// Server: list every business the current user can access.
// RLS on businesses + user_businesses ensures only permitted rows are returned.
// ─────────────────────────────────────────────
export async function listAccessibleBusinesses(): Promise<Business[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from('businesses')
    .select('id, name, type, is_active')
    .eq('is_active', true)
    .order('name');
  return (data as Business[]) ?? [];
}

// ─────────────────────────────────────────────
// Server: resolve which business is active.
// Priority: cookie → first accessible.
// The URL ?b= param is handled client-side by the BusinessSwitcher
// (it calls the switchBusiness server action which writes the cookie,
//  then revalidatePath causes this to re-run with the updated cookie).
// Throws if the user has no accessible businesses.
// ─────────────────────────────────────────────
export async function getActiveBusinessId(): Promise<string> {
  const businesses = await listAccessibleBusinesses();

  if (businesses.length === 0) {
    throw new Error('NO_BUSINESS_ACCESS');
  }

  const ids = businesses.map((b) => b.id);
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(BUSINESS_COOKIE)?.value ?? null;

  if (fromCookie && ids.includes(fromCookie)) return fromCookie;

  // Fallback: first business in the list
  return ids[0];
}
