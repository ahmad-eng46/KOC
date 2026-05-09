'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { listAccessibleBusinesses, BUSINESS_COOKIE } from '@/lib/business';

export async function switchBusiness(businessId: string): Promise<{ ok: boolean; error?: string }> {
  const businesses = await listAccessibleBusinesses();
  const valid = businesses.some((b) => b.id === businessId);

  if (!valid) {
    return { ok: false, error: 'You do not have access to that business.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(BUSINESS_COOKIE, businessId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    httpOnly: false, // readable by client JS for Zustand hydration
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}
