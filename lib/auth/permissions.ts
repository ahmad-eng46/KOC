export type Role = 'admin' | 'accountant' | 'staff' | 'viewer';

export type Permission =
  | 'customers.view'
  | 'customers.create'
  | 'customers.update'
  | 'customers.delete'
  | 'products.view'
  | 'products.create'
  | 'products.update'
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

  staff: [
    'customers.view',
    'customers.create',
    'products.view',
    'invoices.view',
    'invoices.create',
    'payments.view',
    'payments.create',
    'stock.view',
    'stock.update',
    // Staff record deliveries they hold the note for, but never browse cost:
    // stock_purchases_for_role NULLs the money columns for this role, and
    // supplier_payments is out of reach entirely.
    'suppliers.view',
    'purchases.view',
    'purchases.create',
    'returns.view',
    'reports.view_basic',
  ],

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

export const ALL_PERMISSIONS: Permission[] = [
  'customers.view', 'customers.create', 'customers.update', 'customers.delete',
  'products.view', 'products.create', 'products.update',
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

export const PERMISSION_LABELS: Record<Permission, string> = {
  'customers.view': 'View customers',
  'customers.create': 'Add customers',
  'customers.update': 'Edit customers',
  'customers.delete': 'Delete customers',
  'products.view': 'View products',
  'products.create': 'Add products',
  'products.update': 'Edit products',
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
  { label: 'Products & Stock', permissions: ['products.view', 'products.create', 'products.update', 'stock.view', 'stock.update'] },
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
export const UNOVERRIDABLE: readonly Permission[] = ['users.manage', 'settings.manage'];

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
