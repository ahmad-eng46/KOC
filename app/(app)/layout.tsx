import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { listAccessibleBusinesses, getActiveBusinessId } from '@/lib/business';
import { loadOverrides } from '@/lib/auth/can-user';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { effectivePermissionSet } from '@/lib/auth/effective';
import { getUserPageAccessMap } from '@/lib/auth/page-access';
import { pageKeyForPath } from '@/lib/auth/page-access-rules';
import { AppShell } from '@/components/layout/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [businesses, activeId] = await Promise.all([
    listAccessibleBusinesses(),
    getActiveBusinessId().catch(() => null),
  ]);

  if (!activeId) {
    redirect('/no-access');
  }

  // Resolved here, once per navigation, so the sidebar shows what this user can
  // actually reach — role plus their overrides — instead of what the role alone
  // implies. Each page still re-checks server-side; this only decides the links.
  const overrides = await loadOverrides(session.id, activeId);
  const permissions = effectivePermissionSet(session.role, ALL_PERMISSIONS, overrides);

  // Resolved once here, not per link: the sidebar renders on every navigation.
  const pageAccess = await getUserPageAccessMap(session.id, activeId, session.role);

  // A hidden sidebar link is not protection — someone can type the URL. This is
  // the same map, applied to the path being served, in the one layout every
  // protected route passes through. Done here rather than in proxy.ts because
  // the middleware runs on the edge without a database round trip budget for
  // three queries on every asset request.
  const requestedPath = (await headers()).get('x-pathname') ?? '';
  const guardKey = pageKeyForPath(requestedPath);
  if (guardKey && pageAccess[guardKey] === false) {
    redirect('/no-access');
  }

  return (
    <AppShell session={session} businesses={businesses} activeId={activeId} permissions={permissions} pageAccess={pageAccess}>
      {children}
    </AppShell>
  );
}
