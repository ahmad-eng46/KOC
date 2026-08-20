import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listAccessibleBusinesses, getActiveBusinessId } from '@/lib/business';
import { loadOverrides } from '@/lib/auth/can-user';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { effectivePermissionSet } from '@/lib/auth/effective';
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

  return (
    <AppShell session={session} businesses={businesses} activeId={activeId} permissions={permissions}>
      {children}
    </AppShell>
  );
}
