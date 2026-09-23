'use client';

import { useState } from 'react';
import { List, ShieldCheck } from 'lucide-react';
import { ActivityLogView } from './ActivityLogView';
import { AuditFeedView } from './AuditFeedView';

/**
 * Two readings of one log, on one screen.
 *
 * "Activity" is what everyone with access to this page already had: who did
 * what, in plain language. "Audit" is the admin's own view — their actions
 * included, with the money movement and the stated reason attached, and an
 * unread marker so a correction posted while they were away is not missed.
 *
 * They share a store on purpose. A separate audit table would have meant the
 * same event written twice and two versions of the truth to reconcile; the
 * second reading is a view over the first (0076).
 */
export function ActivityLogTabs({
  isAdmin,
  initialUserId = '',
}: {
  isAdmin: boolean;
  initialUserId?: string;
}) {
  const [tab, setTab] = useState<'activity' | 'audit'>('activity');

  if (!isAdmin) return <ActivityLogView initialUserId={initialUserId} />;

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <TabButton
            active={tab === 'activity'}
            onClick={() => setTab('activity')}
            icon={<List size={14} />}
          >
            Activity
          </TabButton>
          <TabButton
            active={tab === 'audit'}
            onClick={() => setTab('audit')}
            icon={<ShieldCheck size={14} />}
          >
            Audit
          </TabButton>
        </nav>
      </div>

      {tab === 'activity'
        ? <ActivityLogView initialUserId={initialUserId} />
        : <AuditFeedView />}
    </div>
  );
}

function TabButton({
  active, onClick, children, icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300',
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
