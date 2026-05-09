'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Building2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { useBusinessStore } from '@/lib/store/business';
import { switchBusiness } from '@/lib/actions/business';
import { BUSINESS_COOKIE } from '@/lib/business';

export function BusinessSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeId, businesses, setActive } = useBusinessStore();
  const [pending, startTransition] = useTransition();

  const active = businesses.find((b) => b.id === activeId);

  // 0 businesses
  if (businesses.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs font-medium text-orange-700">
        <AlertCircle size={12} />
        Contact admin
      </span>
    );
  }

  // 1 business — show name only, no dropdown
  if (businesses.length === 1) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Building2 size={15} className="text-gray-400 shrink-0" />
        {businesses[0].name}
      </span>
    );
  }

  // Multiple businesses — dropdown
  async function handleSelect(id: string) {
    if (id === activeId || pending) return;

    // Optimistic update in Zustand
    setActive(id);

    // Write cookie client-side immediately (server action also writes it)
    document.cookie = `${BUSINESS_COOKIE}=${id};path=/;max-age=${60 * 60 * 24 * 30};samesite=lax`;

    startTransition(async () => {
      const result = await switchBusiness(id);

      if (!result.ok) {
        // Revert optimistic update
        setActive(activeId ?? '');
        return;
      }

      // Invalidate ALL TanStack Query caches — data belongs to a different business now
      queryClient.clear();

      // Replace URL with new business param, preserving rest of path
      const url = new URL(window.location.href);
      url.searchParams.set('b', id);
      router.replace(url.pathname + url.search);
    });
  }

  return (
    <div className="relative group">
      <button
        disabled={pending}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px]',
          'text-gray-700 hover:bg-gray-100 border border-transparent hover:border-gray-200',
          pending && 'opacity-60 cursor-wait',
        )}
      >
        <Building2 size={15} className="text-gray-400 shrink-0" />
        <span className="max-w-[140px] truncate">{active?.name ?? '…'}</span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {/* Dropdown */}
      <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50 hidden group-focus-within:block group-hover:block">
        {businesses.map((biz) => (
          <button
            key={biz.id}
            onClick={() => handleSelect(biz.id)}
            className={clsx(
              'flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-left transition-colors',
              biz.id === activeId
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50',
            )}
          >
            <Building2 size={14} className="shrink-0 opacity-60" />
            <span className="truncate">{biz.name}</span>
            {biz.id === activeId && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                active
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
