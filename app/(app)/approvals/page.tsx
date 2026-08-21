import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/guards';
import { getSession } from '@/lib/auth/session';
import { ApprovalsList } from '@/components/approvals/ApprovalsList';

export const metadata = { title: 'Approvals — KOC' };

export default async function ApprovalsPage() {
  await requireAuth();
  const session = await getSession();
  if (!session) redirect('/login');

  const isAdmin = session.role === 'admin';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {isAdmin ? 'Approvals' : 'My Deletion Requests'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isAdmin
            ? 'Deletion requests waiting on you, and the ones already decided'
            : 'What you have asked to delete, and what the admin decided'}
        </p>
      </div>

      {/* Non-admins get the same page rather than a separate one: RLS already
          narrows it to their own requests, so one screen serves both. */}
      <ApprovalsList isAdmin={isAdmin} currentUserId={session.id} />
    </div>
  );
}
