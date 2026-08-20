'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ShieldCheck, KeyRound } from 'lucide-react';
import type { UserListRow } from '@/lib/actions/user';
import { PermissionMatrix } from './PermissionMatrix';

type Tab = 'overview' | 'permissions';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: KeyRound },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
];

export function UserDetail({ user }: { user: UserListRow }) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={[
              'inline-flex items-center gap-1.5 h-11 px-4 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
              tab === id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview user={user} />}
      {tab === 'permissions' && <PermissionMatrix userId={user.id} userName={user.full_name} />}
    </div>
  );
}

function Overview({ user }: { user: UserListRow }) {
  const fmt = (v: string | null) => (v ? format(parseISO(v), 'dd MMM yyyy HH:mm') : '—');

  return (
    <dl className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
      <Row label="Role"><span className="capitalize">{user.role}</span></Row>
      <Row label="Phone">{user.phone ?? '—'}</Row>
      <Row label="Status">
        {user.deleted_at ? 'Deleted' : user.is_active ? 'Active' : 'Disabled'}
      </Row>
      <Row label="Businesses">
        {user.businesses.length === 0
          ? '—'
          : user.businesses.map((b) => b.name).join(', ')}
      </Row>
      <Row label="Password last changed">
        {user.password_changed_at ? (
          format(parseISO(user.password_changed_at), 'dd MMM yyyy')
        ) : (
          <span className="text-red-600">Never changed (using temporary password)</span>
        )}
      </Row>
      <Row label="Invited">{fmt(user.invited_at ?? user.created_at)}</Row>
      <Row label="Last login">{fmt(user.last_login_at)}</Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3">
      <dt className="text-xs font-medium text-gray-500 sm:w-48 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}
