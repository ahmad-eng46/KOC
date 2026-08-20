/**
 * Presentation rules for one activity entry: which colour marks the person,
 * how long ago it happened, and where clicking should take you. Pure, so the
 * feed, the widget and the user panel all agree.
 */

const DOT_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500',
] as const;

/**
 * A stable colour per user, from their id — so the same person is the same
 * colour on every screen and across sessions, with no palette to store.
 */
export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return DOT_COLORS[hash % DOT_COLORS.length];
}

/** "2 minutes ago", "Yesterday", "05 Aug 2026". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThen = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const days = Math.round((startOfToday.getTime() - startOfThen.getTime()) / 86_400_000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  return then.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  invoice: (id) => `/invoices/${id}`,
  customer: (id) => `/customers/${id}`,
  product: (id) => `/products/${id}`,
  supplier: (id) => `/suppliers/${id}`,
  user: (id) => `/settings/users/${id}`,
};

/** Where an entry links to, or null when the entity has no page of its own. */
export function activityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  const route = ENTITY_ROUTES[entityType];
  return route ? route(entityId) : null;
}

export const ACTION_GROUPS = [
  { value: '', label: 'All activity' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'payment', label: 'Payments' },
  { value: 'expense', label: 'Expenses' },
  { value: 'return', label: 'Returns' },
  { value: 'stock', label: 'Stock' },
  { value: 'product', label: 'Products' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'user', label: 'Sign-ins & passwords' },
  { value: 'permission', label: 'Permissions' },
  { value: 'backup', label: 'Backups' },
] as const;

export const DATE_RANGES = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '', label: 'All time' },
] as const;

export function sinceFromDays(days: string, now: Date = new Date()): string | undefined {
  if (!days) return undefined;
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(now.getTime() - n * 86_400_000).toISOString();
}
