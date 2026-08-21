'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { BusinessProvider } from '@/components/providers/BusinessProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { type SessionUser } from '@/lib/auth/session';
import { type Business } from '@/lib/business-shared';
import { type Permission } from '@/lib/auth/permissions';

type Props = {
  session: SessionUser;
  businesses: Business[];
  activeId: string;
  permissions: Permission[];
  /** page key → may this user see it. Resolved server-side in the layout. */
  pageAccess: Record<string, boolean>;
  children: React.ReactNode;
};

export function AppShell({ session, businesses, activeId, permissions, pageAccess, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <QueryProvider>
      <BusinessProvider businesses={businesses} activeId={activeId}>
        <ToastProvider>
        <div className="flex h-full min-h-screen bg-gray-50">
          <Sidebar
            role={session.role}
            permissions={permissions}
            pageAccess={pageAccess}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <div className="flex flex-col flex-1 min-w-0">
            <Header user={session} onMenuClick={() => setSidebarOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
        </ToastProvider>
      </BusinessProvider>
    </QueryProvider>
  );
}
