'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell, PackagePlus, Pencil, FileText, Wallet, Truck, Undo2, TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { useStaffNotifications, useMarkNotificationsSeen } from '@/lib/queries/notifications';
import { relativeTime, activityHref, userColor } from '@/lib/activity-display';
import type { StaffNotification } from '@/lib/actions/notifications';

/** The action's icon, and the words an owner would use for it. */
const ACTION_META: Record<string, { icon: typeof Bell; verb: string }> = {
  'product.created': { icon: PackagePlus, verb: 'added a product' },
  'product.updated': { icon: Pencil, verb: 'edited a product' },
  'invoice.created': { icon: FileText, verb: 'made an invoice' },
  'payment.recorded': { icon: Wallet, verb: 'recorded a payment' },
  'stock.purchased': { icon: Truck, verb: 'recorded a stock purchase' },
  'return.processed': { icon: Undo2, verb: 'processed a return' },
  'invoice.rate_overridden': { icon: TrendingDown, verb: 'changed a sale rate' },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data } = useStaffNotifications(true);
  const markSeen = useMarkNotificationsSeen();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  // Opening the panel is the act of reading it. Marked once per open rather
  // than on every render, or the badge would clear itself in the background
  // while the panel sits closed.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markSeen.mutate();
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-[18px] text-center tabular-nums">
            {unread > 29 ? '29+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Staff activity</p>
            <p className="text-xs text-gray-500 mt-0.5">
              What your team has done. Nothing here is waiting on you.
            </p>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              Nothing yet. Staff actions will show up here.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
              {items.map((n) => (
                <NotificationRow key={n.id} notification={n} onNavigate={() => setOpen(false)} />
              ))}
            </ul>
          )}

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <Link
              href="/settings/activity-log"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              See the full activity log →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onNavigate,
}: {
  notification: StaffNotification;
  onNavigate: () => void;
}) {
  const meta = ACTION_META[n.action];
  const Icon = meta?.icon ?? Bell;
  const href = activityHref(n.entity_type, n.entity_id);

  const body = (
    <div className="flex gap-3 px-4 py-3">
      <span
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white ${userColor(n.actor_id)}`}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{n.actor_name}</span>{' '}
          {meta?.verb ?? n.action.replace('.', ' ')}
        </p>
        <p className="text-xs text-gray-600 mt-0.5 break-words">{n.description}</p>
        {n.metadata?.below_cost === true && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-red-50 border border-red-200 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
            <AlertTriangle size={11} />
            Sold below cost
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
      </div>
      {n.is_unread && (
        <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-blue-600" aria-label="Unread" />
      )}
    </div>
  );

  return (
    <li className={n.is_unread ? 'bg-blue-50/40' : undefined}>
      {href ? (
        <Link href={href} onClick={onNavigate} className="block hover:bg-gray-50">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}
