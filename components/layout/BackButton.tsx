'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { parentRoute, backLabel } from '@/lib/navigation/parent-route';
import { useHasUnsavedChanges } from '@/lib/store/unsaved';

/**
 * The one back control in the app. Rendered by the app shell, so a new page
 * gets it without doing anything, and there is a single place to change how
 * back behaves.
 *
 * It is a button rather than a Link because it may need to stop and ask about
 * unsaved edits before it navigates. The destination is still a real route
 * computed from the path, not history — see lib/navigation/parent-route.ts.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const hasUnsaved = useHasUnsavedChanges();

  const parent = parentRoute(pathname ?? '');
  if (!parent) return null;

  const label = backLabel(parent);

  function go() {
    if (
      hasUnsaved &&
      !window.confirm('You have unsaved changes. Leave this page and lose them?')
    ) {
      return;
    }
    router.push(parent!);
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={go}
        aria-label={label}
        title={label}
        className={[
          'inline-flex items-center gap-1 h-9 pl-1.5 pr-2.5 rounded-lg',
          'text-sm font-medium text-gray-500',
          'hover:text-gray-900 hover:bg-gray-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
        ].join(' ')}
      >
        <ChevronLeft size={18} />
        <span>Back</span>
      </button>
    </div>
  );
}
