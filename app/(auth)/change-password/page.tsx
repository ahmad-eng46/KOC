import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';

export const metadata = { title: 'Set Your Password — KOC' };

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <ChangePasswordForm mandatory={session.must_change_password} />;
}
