import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { BUSINESS_COOKIE, type Business } from '@/lib/business-shared';

export { BUSINESS_COOKIE };
export type { Business };

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

  // Oil is the primary trading business, so it leads the switcher and becomes
  // the fallback in getActiveBusinessId(). Keyed on type rather than name so a
  // rename does not silently change which business a fresh session opens on.
  return sortOilFirst((data as Business[]) ?? []);
}

export function sortOilFirst(businesses: Business[]): Business[] {
  return [...businesses].sort((a, b) => {
    const aOil = a.type === 'oil' ? 0 : 1;
    const bOil = b.type === 'oil' ? 0 : 1;
    if (aOil !== bOil) return aOil - bOil;
    return a.name.localeCompare(b.name);
  });
}

// ─────────────────────────────────────────────
// Server: resolve which business is active.
// Priority: cookie → the oil business → first accessible.
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

  // Fallback: first in the list, which sortOilFirst() puts as the oil business
  return ids[0];
}
