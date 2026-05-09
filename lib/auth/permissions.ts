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
    'returns.view',
    'reports.view_basic',
  ],

  viewer: [
    'customers.view',
    'products.view',
    'invoices.view',
    'reports.view_basic',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  const perms = PERMISSIONS[role];
  if (perms[0] === '*') return true;
  return (perms as Permission[]).includes(permission);
}
