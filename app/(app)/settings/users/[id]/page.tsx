import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getUserById } from '@/lib/actions/user';
import { UserDetail } from '@/components/settings/UserDetail';

export const metadata = { title: 'User — KOC' };

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('admin');
  const { id } = await params;

  const r = await getUserById(id);
  if (!r.ok) notFound();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/settings/users"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{r.data.full_name}</h1>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{r.data.email}</p>
        </div>
      </div>

      <UserDetail user={r.data} />
    </div>
  );
}
