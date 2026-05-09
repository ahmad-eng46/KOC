import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { listAccessibleBusinesses, getActiveBusinessId } from '@/lib/business';
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

  return (
    <AppShell session={session} businesses={businesses} activeId={activeId}>
      {children}
    </AppShell>
  );
}
