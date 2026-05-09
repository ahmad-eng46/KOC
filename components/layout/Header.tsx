'use client';

import { Menu } from 'lucide-react';
import { UserMenu } from '@/components/layout/UserMenu';
import { BusinessSwitcher } from '@/components/layout/BusinessSwitcher';
import { type SessionUser } from '@/lib/auth/session';

type Props = {
  user: SessionUser;
  onMenuClick: () => void;
};

export function Header({ user, onMenuClick }: Props) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <BusinessSwitcher />
      </div>
      <UserMenu user={user} />
    </header>
  );
}
