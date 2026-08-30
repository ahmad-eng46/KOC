/**
 * Where "back" goes, decided from the URL alone.
 *
 * Deliberately not router.back(). History back is wrong here more often than
 * it is right: after a redirect it returns to the page that redirected, after
 * a form submit it returns to the filled-in form, and on a link opened
 * directly there is no history to return to at all. The parent route is
 * derivable from the path, always exists, and behaves the same however the
 * page was reached.
 *
 * The rule is "drop the last segment", which is right for almost every route
 * and stays right for pages nobody has written yet:
 *
 *   /products/123/edit -> /products/123 -> /products -> /dashboard
 *
 * The exceptions below are routes whose URL parent is not their logical
 * parent, and one that would be actively harmful.
 */

/** No parent worth offering, or no chrome to put it in. */
const NO_BACK = new Set([
  '/dashboard',        // the root of the app
  '/login',
  '/change-password',  // a dead end on purpose — you leave by changing it
  '/no-access',
  '/unauthorized',     // carries its own way out
]);

/**
 * Routes whose logical parent is not the segment above them.
 *
 * The four /settings ones matter beyond tidiness: /settings is the
 * admin-only business-configuration form, and since 0061 staff reach brands,
 * categories and the activity log without it. Dropping a segment would send a
 * staff member from a page they may use to one that bounces them to
 * /unauthorized. So each points at the screen it is actually reached from.
 */
const OVERRIDES: Record<string, string> = {
  '/settings': '/dashboard',
  '/settings/brands': '/products',
  '/settings/customer-categories': '/customers',
  '/settings/expense-assets': '/expenses',
  '/settings/activity-log': '/dashboard',
  // Returns have no list of their own; they are raised against an invoice.
  '/returns/new': '/invoices',
};

/** Trailing slashes and query strings are not part of the decision. */
function normalise(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

/**
 * The parent of `pathname`, or null where no back button should be shown.
 */
export function parentRoute(pathname: string): string | null {
  const path = normalise(pathname);

  if (!path.startsWith('/')) return null;
  if (NO_BACK.has(path)) return null;
  if (path in OVERRIDES) return OVERRIDES[path];

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // A top-level page's parent is the dashboard, not "/".
  if (segments.length === 1) return '/dashboard';

  return `/${segments.slice(0, -1).join('/')}`;
}

/**
 * What the button says. Generic rather than a label per route: a name that has
 * to be registered is a name that will be missing on the next page someone
 * adds, and "Back" is never wrong.
 */
export function backLabel(parent: string): string {
  const segments = parent.split('/').filter(Boolean);
  if (segments.length === 0) return 'Back';

  const last = segments[segments.length - 1];
  // An id tells the user nothing; the section above it does.
  if (/^[0-9a-f-]{16,}$/i.test(last)) return 'Back';

  const words = last.replace(/-/g, ' ');
  return `Back to ${words}`;
}
