'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { type SessionUser } from '@/lib/auth/session';

type Props = {
  session: SessionUser;
  children: React.ReactNode;
};

export function AppShell({ session, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      <Sidebar
        role={session.role}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <Header user={session} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
