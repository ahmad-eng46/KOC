import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth/guards';
import { getBackupSchedule } from '@/lib/actions/backup';
import { BackupPanel } from '@/components/settings/BackupPanel';

export const metadata = { title: 'Backup — KOC' };

export default async function BackupPage() {
  await requireRole('admin');
  const schedule = await getBackupSchedule();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Backup</h1>
          <p className="text-sm text-gray-500 mt-0.5">Excel exports of every major table. Manual or scheduled.</p>
        </div>
      </div>
      <BackupPanel initialSchedule={schedule} />
    </div>
  );
}
