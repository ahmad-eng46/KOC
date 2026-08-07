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
