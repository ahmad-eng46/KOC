export type Role = 'admin' | 'accountant' | 'staff' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  accountant: 'Accountant',
  staff: 'Staff',
  viewer: 'Viewer',
};

export type Permission =
  | 'customers.view'
  | 'customers.create'
  | 'customers.update'
  | 'customers.delete'
  | 'products.view'
  | 'products.create'
  | 'products.update'
  | 'products.delete'
  | 'invoices.view'
  | 'invoices.create'
  | 'invoices.update'
  | 'payments.view'
  | 'payments.create'
  | 'payments.update'
  | 'expenses.view'
  | 'expenses.create'
  | 'expenses.update'
  | 'returns.view'
  | 'returns.create'
  | 'stock.view'
  | 'stock.update'
  | 'suppliers.view'
  | 'suppliers.create'
  | 'suppliers.update'
  | 'purchases.view'
  | 'purchases.create'
  | 'supplier_payments.view'
  | 'supplier_payments.create'
  | 'reports.view'
  | 'reports.pnl'
  | 'reports.view_basic'
  | 'ledger.view'
  | 'investments.view'
  | 'investments.create'
  | 'loans.view'
  | 'loans.create'
  | 'users.manage'
  | 'settings.manage';

/**
 * Every permission in the system, declared before the role table so `staff`
 * can be defined by subtraction. ALL_PERMISSIONS below re-exports it under the
 * name the rest of the app already uses.
 */
const ALL_PERMISSIONS_BASE: Permission[] = [
  'customers.view', 'customers.create', 'customers.update', 'customers.delete',
  'products.view', 'products.create', 'products.update', 'products.delete',
  'invoices.view', 'invoices.create', 'invoices.update',
  'payments.view', 'payments.create', 'payments.update',
  'expenses.view', 'expenses.create', 'expenses.update',
  'returns.view', 'returns.create',
  'stock.view', 'stock.update',
  'suppliers.view', 'suppliers.create', 'suppliers.update',
  'purchases.view', 'purchases.create',
  'supplier_payments.view', 'supplier_payments.create',
  'reports.view', 'reports.pnl', 'reports.view_basic',
  'ledger.view',
  'investments.view', 'investments.create',
  'loans.view', 'loans.create',
  'users.manage', 'settings.manage',
];

/** What staff do not get. See the note on `staff` below for why each is here. */
const STAFF_WITHHELD: Permission[] = [
  'users.manage',
  'settings.manage',
  'customers.delete',
  'products.delete',
];

const PERMISSIONS: Record<Role, Permission[] | ['*']> = {
  admin: ['*'],

  accountant: [
    'customers.view',
    'customers.create',
    'customers.update',
    'products.view',
    'invoices.view',
    'invoices.create',
    'invoices.update',
    'payments.view',
    'payments.create',
    'payments.update',
    'expenses.view',
    'expenses.create',
    'expenses.update',
    'returns.view',
    'returns.create',
    'stock.view',
    'suppliers.view',
    'suppliers.create',
    'suppliers.update',
    'purchases.view',
    'purchases.create',
    'supplier_payments.view',
    'supplier_payments.create',
    'reports.view',
    'reports.pnl',
    'ledger.view',
    'investments.view',
    'loans.view',
  ],

  /**
   * Staff run the business day to day, so the list is defined by what they are
   * NOT given rather than by enumeration — anything added to ALL_PERMISSIONS
   * later reaches staff automatically, which is what stops this drifting back
   * into a shorter list than admin's every time a feature lands.
   *
   * The four exclusions, and why each one is not negotiable:
   *
   *   users.manage / settings.manage — a staff member who can edit users can
   *     make themselves an admin, and an admin approves their own deletion
   *     requests. Granting these would not widen staff access, it would delete
   *     the role model.
   *   customers.delete / products.delete — deletion is the one thing staff
   *     ask for rather than do. That is the whole point of the approval flow.
   *
   * Cost prices are absent from this list because they are not in it to give:
   * products_for_role NULLs the column from user_role(), so no application
   * grant can produce one (iron rule #3).
   */
  staff: ALL_PERMISSIONS_BASE.filter(
    (p) => !STAFF_WITHHELD.includes(p),
  ),

  viewer: [
    'customers.view',
    'products.view',
    'invoices.view',
    'suppliers.view',
    'purchases.view',
    'reports.view_basic',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  const perms = PERMISSIONS[role];
  if (perms[0] === '*') return true;
  return (perms as Permission[]).includes(permission);
}

// ─────────────────────────────────────────────
// Per-user overrides build on top of the table above. `can()` stays the
// role-only answer and remains correct everywhere it is already used;
// `canUser()` (lib/auth/can-user.ts) layers a user's overrides over it.
// ─────────────────────────────────────────────

export const ALL_PERMISSIONS: Permission[] = ALL_PERMISSIONS_BASE;

export const PERMISSION_LABELS: Record<Permission, string> = {
  'customers.view': 'View customers',
  'customers.create': 'Add customers',
  'customers.update': 'Edit customers',
  'customers.delete': 'Delete customers',
  'products.view': 'View products',
  'products.create': 'Add products',
  'products.update': 'Edit products',
  'products.delete': 'Delete products',
  'invoices.view': 'View invoices',
  'invoices.create': 'Create invoices',
  'invoices.update': 'Edit invoices',
  'payments.view': 'View payments',
  'payments.create': 'Record payments',
  'payments.update': 'Edit payments',
  'expenses.view': 'View expenses',
  'expenses.create': 'Add expenses',
  'expenses.update': 'Edit expenses',
  'returns.view': 'View returns',
  'returns.create': 'Process returns',
  'stock.view': 'View stock',
  'stock.update': 'Adjust stock',
  'suppliers.view': 'View suppliers',
  'suppliers.create': 'Add suppliers',
  'suppliers.update': 'Edit suppliers',
  'purchases.view': 'View stock purchases',
  'purchases.create': 'Record stock purchases',
  'supplier_payments.view': 'View supplier payments',
  'supplier_payments.create': 'Record supplier payments',
  'reports.view': 'View full reports',
  'reports.pnl': 'View profit & loss',
  'reports.view_basic': 'View basic reports',
  'ledger.view': 'View ledger',
  'investments.view': 'View investments',
  'investments.create': 'Record investments',
  'loans.view': 'View loans',
  'loans.create': 'Record loans',
  'users.manage': 'Manage users',
  'settings.manage': 'Manage settings',
};

export const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
  { label: 'Customers', permissions: ['customers.view', 'customers.create', 'customers.update', 'customers.delete'] },
  { label: 'Products & Stock', permissions: ['products.view', 'products.create', 'products.update', 'products.delete', 'stock.view', 'stock.update'] },
  { label: 'Invoices & Returns', permissions: ['invoices.view', 'invoices.create', 'invoices.update', 'returns.view', 'returns.create'] },
  { label: 'Payments', permissions: ['payments.view', 'payments.create', 'payments.update'] },
  { label: 'Expenses', permissions: ['expenses.view', 'expenses.create', 'expenses.update'] },
  { label: 'Suppliers & Purchasing', permissions: ['suppliers.view', 'suppliers.create', 'suppliers.update', 'purchases.view', 'purchases.create', 'supplier_payments.view', 'supplier_payments.create'] },
  { label: 'Money & Reports', permissions: ['reports.view_basic', 'reports.view', 'reports.pnl', 'ledger.view', 'investments.view', 'investments.create', 'loans.view', 'loans.create'] },
  { label: 'Administration', permissions: ['users.manage', 'settings.manage'] },
];

/**
 * Overriding these would hand someone the keys to the whole system, so the UI
 * refuses. An admin who should not be an admin is a role change, not a grant.
 */
export const UNOVERRIDABLE: readonly Permission[] = [
  'users.manage',
  'settings.manage',
  // Deleting a product removes it from every historical invoice's context.
  // products_delete_role in 0058 refuses it for anyone but an admin, so a tick
  // here would promise something the database declines to honour.
  'products.delete',
];

/**
 * Cost prices are hidden by the products_for_role VIEW using user_role(), not by
 * this table (iron rule #3). An application-level grant would change nothing —
 * the database still returns NULL — so the matrix shows it as locked rather than
 * offering a switch that silently does nothing.
 */
export const COST_PRICE_PSEUDO_PERMISSION = 'products.view_cost' as const;
export const COST_PRICE_LABEL = 'View cost prices';

export function roleAllowsCostPrice(role: Role): boolean {
  return role === 'admin' || role === 'accountant';
}
