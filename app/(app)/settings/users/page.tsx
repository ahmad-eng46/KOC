import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { UserTable } from '@/components/settings/UserTable';

export const metadata = { title: 'Users — KOC' };

export default async function UsersPage() {
  await requireRole('admin');
  const session = await getSession();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add, edit, and manage who can sign in</p>
        </div>
      </div>
      <UserTable currentUserId={session?.id ?? ''} />
    </div>
  );
}
