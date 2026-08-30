import type { Role } from '@/lib/auth/permissions';

/**
 * The whole page-access decision, pure and in one place, so the sidebar, the
 * route guard, the action buttons and the admin checklist cannot each reach a
 * different answer about the same user and the same page.
 */

export type PageCategory = 'main' | 'reports' | 'settings' | 'actions';

export const CATEGORY_LABELS: Record<PageCategory, string> = {
  main: 'Main Pages',
  reports: 'Reports',
  settings: 'Settings & Admin',
  actions: 'Actions',
};

export type PageDefinition = {
  key: string;
  label: string;
  category: PageCategory;
  sort_order: number;
  description: string | null;
  default_admin: boolean;
  default_accountant: boolean;
  default_staff: boolean;
  default_viewer: boolean;
  is_lockable: boolean;
  /** The permission this key narrows, where one exists. */
  permission_key: string | null;
};

export function roleDefault(page: PageDefinition, role: Role): boolean {
  switch (role) {
    case 'admin':      return page.default_admin;
    case 'accountant': return page.default_accountant;
    case 'staff':      return page.default_staff;
    case 'viewer':     return page.default_viewer;
  }
}

/**
 * A page the database itself decides. Only cost prices today: products_for_role
 * NULLs those columns from user_role(), so a tick for staff or viewer would
 * promise something the database refuses to deliver.
 */
export function isLockedFor(page: PageDefinition, role: Role): boolean {
  return page.is_lockable && (role === 'staff' || role === 'viewer');
}

export type AccessInput = {
  role: Role;
  page: PageDefinition;
  /** The admin's tick for this user, or null when they have not set one. */
  override: boolean | null;
  /**
   * Whether the permission system already allows the underlying operation.
   * Ignored when the page names no permission.
   */
  permissionAllowed: boolean;
};

/**
 * Order matters, and each step is a rule someone will ask about:
 *
 *   1. An admin sees everything. Enforced here rather than only in the UI, so a
 *      row inserted by hand cannot lock an admin out of their own business.
 *   2. A locked page is refused for staff and viewer whatever the tick says.
 *   3. The permission system can only ever narrow: if the role and its
 *      overrides deny the operation, a ticked box does not grant it. This is
 *      what stops the two permission stores contradicting each other.
 *   4. Otherwise the admin's tick, and failing that the role default.
 */
export function resolvePageAccess(input: AccessInput): boolean {
  const { role, page, override, permissionAllowed } = input;

  if (role === 'admin') return true;
  if (isLockedFor(page, role)) return false;
  if (page.permission_key && !permissionAllowed) return false;

  return override ?? roleDefault(page, role);
}

/** Every page's answer at once, which is what the sidebar needs. */
export function resolveAccessMap(
  role: Role,
  pages: readonly PageDefinition[],
  overrides: ReadonlyMap<string, boolean>,
  permissionAllows: (permissionKey: string) => boolean,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const page of pages) {
    out[page.key] = resolvePageAccess({
      role,
      page,
      override: overrides.has(page.key) ? overrides.get(page.key)! : null,
      permissionAllowed: page.permission_key ? permissionAllows(page.permission_key) : true,
    });
  }
  return out;
}

/** "7 of 12 pages" for the users list. Actions are counted separately. */
export function accessSummary(
  accessMap: Record<string, boolean>,
  pages: readonly PageDefinition[],
): { allowed: number; total: number } {
  const visible = pages.filter((p) => p.category !== 'actions');
  return {
    allowed: visible.filter((p) => accessMap[p.key]).length,
    total: visible.length,
  };
}

// ───────────────────────────────────────────────
// URL → page key
// ───────────────────────────────────────────────
/**
 * Longest match wins, so /settings/users resolves to 'users' rather than
 * 'settings' and /reports/sales-analytics to the analytics key rather than the
 * sales one. Ordered longest-first for exactly that reason.
 */
const ROUTE_MAP: Array<[string, string]> = [
  // Each of these is its own page key, not 'settings'. /settings is the
  // app-configuration form and stays admin-only; the catalogue screens under
  // it are ordinary business pages that staff use daily, and mapping them onto
  // the same key would lock staff out of brands and categories to protect a
  // form they never open.
  ['/settings/customer-categories', 'settings.categories'],
  ['/settings/expense-assets', 'settings.assets'],
  ['/settings/activity-log', 'settings.activity'],
  ['/settings/brands', 'settings.brands'],
  ['/settings/backup', 'backup'],
  ['/settings/users', 'users'],
  ['/reports/sales-analytics', 'reports.analytics'],
  ['/reports/defaulters', 'reports.defaulters'],
  ['/reports/cash-book', 'reports.cashbook'],
  ['/reports/purchase', 'reports.purchase'],
  ['/reports/customer', 'reports.customer'],
  ['/reports/balance', 'reports.receivables'],
  ['/reports/locations', 'reports.stock'],
  ['/reports/expenses', 'reports.stock'],
  ['/reports/audit', 'reports.audit'],
  ['/reports/stock', 'reports.stock'],
  ['/reports/sales', 'reports.sales'],
  ['/reports/pl', 'reports.pnl'],
  ['/investments', 'investments'],
  ['/approvals', 'approvals'],
  ['/dashboard', 'dashboard'],
  ['/customers', 'customers'],
  ['/suppliers', 'suppliers'],
  ['/locations', 'locations'],
  ['/products', 'products'],
  ['/payments', 'payments'],
  ['/expenses', 'expenses'],
  ['/invoices', 'invoices'],
  ['/settings', 'settings'],
  ['/ledger', 'ledger'],
  ['/stock', 'stock'],
  ['/loans', 'loans'],
];

/**
 * The page key guarding a URL, or null for paths this system does not govern
 * (/login, /profile, /_next). Null means "let it through" — a guard that
 * blocked everything it did not recognise would lock users out of their own
 * profile the first time a route was added.
 */
export function pageKeyForPath(pathname: string): string | null {
  for (const [prefix, key] of ROUTE_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  // /reports itself is the index; anything under it not listed above is a
  // report page that should at least require basic report access.
  if (pathname === '/reports') return 'reports.sales';
  return null;
}
