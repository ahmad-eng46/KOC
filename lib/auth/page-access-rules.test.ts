import { describe, it, expect } from 'vitest';
import {
  resolvePageAccess, resolveAccessMap, roleDefault, isLockedFor,
  accessSummary, pageKeyForPath, type PageDefinition, isDeparture } from '@/lib/auth/page-access-rules';

function page(over: Partial<PageDefinition> = {}): PageDefinition {
  return {
    key: 'payments', label: 'Payments', category: 'main', sort_order: 1,
    description: null,
    default_admin: true, default_accountant: true,
    default_staff: false, default_viewer: false,
    is_lockable: false, permission_key: null,
    ...over,
  };
}

const allow = () => true;
const deny = () => false;

describe('an admin sees everything', () => {
  it('ignores a role default that says otherwise', () => {
    const p = page({ default_admin: false });
    expect(resolvePageAccess({ role: 'admin', page: p, override: null, permissionAllowed: true })).toBe(true);
  });

  it('ignores a row someone inserted denying them', () => {
    // Enforced in the rule, not only the UI, so a hand-written row cannot lock
    // an admin out of their own business.
    expect(resolvePageAccess({ role: 'admin', page: page(), override: false, permissionAllowed: false })).toBe(true);
  });

  it('ignores the lock too', () => {
    const p = page({ key: 'action.view_cost_prices', is_lockable: true });
    expect(resolvePageAccess({ role: 'admin', page: p, override: null, permissionAllowed: true })).toBe(true);
  });
});

describe('role defaults', () => {
  it('applies when the admin has ticked nothing', () => {
    expect(resolvePageAccess({ role: 'accountant', page: page(), override: null, permissionAllowed: true })).toBe(true);
    expect(resolvePageAccess({ role: 'staff', page: page(), override: null, permissionAllowed: true })).toBe(false);
  });

  it('reads the right column per role', () => {
    const p = page({ default_accountant: true, default_staff: false, default_viewer: true });
    expect(roleDefault(p, 'accountant')).toBe(true);
    expect(roleDefault(p, 'staff')).toBe(false);
    expect(roleDefault(p, 'viewer')).toBe(true);
  });
});

describe('the admin tick', () => {
  it('opens a page the role default closes', () => {
    expect(resolvePageAccess({ role: 'staff', page: page(), override: true, permissionAllowed: true })).toBe(true);
  });

  it('closes a page the role default opens', () => {
    expect(resolvePageAccess({ role: 'accountant', page: page(), override: false, permissionAllowed: true })).toBe(false);
  });
});

describe('page access can narrow but never widen', () => {
  // The rule that keeps this table and user_permission_overrides from
  // contradicting each other.
  it('refuses a ticked page whose permission the role denies', () => {
    const p = page({ permission_key: 'payments.view' });
    expect(resolvePageAccess({ role: 'staff', page: p, override: true, permissionAllowed: false })).toBe(false);
  });

  it('allows a ticked page whose permission the role allows', () => {
    const p = page({ permission_key: 'payments.view' });
    expect(resolvePageAccess({ role: 'staff', page: p, override: true, permissionAllowed: true })).toBe(true);
  });

  it('ignores the permission when the page names none', () => {
    expect(resolvePageAccess({ role: 'staff', page: page(), override: true, permissionAllowed: false })).toBe(true);
  });

  it('still lets an untick close a page the permission allows', () => {
    const p = page({ permission_key: 'payments.view' });
    expect(resolvePageAccess({ role: 'accountant', page: p, override: false, permissionAllowed: true })).toBe(false);
  });
});

describe('the locked page', () => {
  const cost = page({ key: 'action.view_cost_prices', is_lockable: true, default_accountant: true });

  it('is refused to staff and viewer even when ticked', () => {
    expect(resolvePageAccess({ role: 'staff', page: cost, override: true, permissionAllowed: true })).toBe(false);
    expect(resolvePageAccess({ role: 'viewer', page: cost, override: true, permissionAllowed: true })).toBe(false);
  });

  it('is available to an accountant', () => {
    expect(resolvePageAccess({ role: 'accountant', page: cost, override: null, permissionAllowed: true })).toBe(true);
  });

  it('reports which roles it is locked for', () => {
    expect(isLockedFor(cost, 'staff')).toBe(true);
    expect(isLockedFor(cost, 'accountant')).toBe(false);
    expect(isLockedFor(page(), 'staff')).toBe(false);
  });
});

describe('resolveAccessMap', () => {
  const pages = [
    page({ key: 'dashboard', default_staff: true }),
    page({ key: 'payments', default_staff: false, permission_key: 'payments.view' }),
    page({ key: 'ledger', default_staff: false }),
  ];

  it('answers for every page in one pass', () => {
    const map = resolveAccessMap('staff', pages, new Map([['ledger', true]]), allow);
    expect(map).toEqual({ dashboard: true, payments: false, ledger: true });
  });

  it('lets a denied permission close a page the tick opened', () => {
    const map = resolveAccessMap('staff', pages, new Map([['payments', true]]), deny);
    expect(map.payments).toBe(false);
  });

  it('gives an admin everything regardless', () => {
    const map = resolveAccessMap('admin', pages, new Map([['dashboard', false]]), deny);
    expect(Object.values(map).every(Boolean)).toBe(true);
  });
});

describe('accessSummary', () => {
  it('counts pages and leaves actions out of the total', () => {
    const pages = [
      page({ key: 'dashboard', category: 'main' }),
      page({ key: 'payments', category: 'main' }),
      page({ key: 'reports.sales', category: 'reports' }),
      page({ key: 'action.create_invoice', category: 'actions' }),
    ];
    const map = { dashboard: true, payments: false, 'reports.sales': true, 'action.create_invoice': true };
    expect(accessSummary(map, pages)).toEqual({ allowed: 2, total: 3 });
  });
});

describe('pageKeyForPath', () => {
  it('maps the plain pages', () => {
    expect(pageKeyForPath('/dashboard')).toBe('dashboard');
    expect(pageKeyForPath('/payments')).toBe('payments');
  });

  it('prefers the longer match, so a sub-page is not read as its parent', () => {
    expect(pageKeyForPath('/settings/users')).toBe('users');
    expect(pageKeyForPath('/settings/backup')).toBe('backup');
    expect(pageKeyForPath('/settings')).toBe('settings');
    expect(pageKeyForPath('/reports/sales-analytics')).toBe('reports.analytics');
    expect(pageKeyForPath('/reports/sales')).toBe('reports.sales');
  });

  it('guards a detail page with its list page key', () => {
    expect(pageKeyForPath('/customers/abc-123')).toBe('customers');
    expect(pageKeyForPath('/invoices/abc-123')).toBe('invoices');
    expect(pageKeyForPath('/settings/users/abc-123')).toBe('users');
  });

  it('lets through what it does not govern, rather than blocking it', () => {
    // A guard that refused every unrecognised path would lock users out of
    // their own profile the first time a route was added.
    expect(pageKeyForPath('/profile')).toBeNull();
    expect(pageKeyForPath('/login')).toBeNull();
    expect(pageKeyForPath('/no-access')).toBeNull();
  });
});

describe('isDeparture', () => {
  const page = (over: Partial<PageDefinition> = {}): PageDefinition => ({
    key: 'invoices', label: 'Invoices', category: 'main', sort_order: 1,
    description: null,
    default_admin: true, default_accountant: true, default_staff: true, default_viewer: true,
    is_lockable: false, permission_key: 'invoices.view',
    ...over,
  });

  it('is false when the tick only restates the role default', () => {
    expect(isDeparture(page(), 'staff', true)).toBe(false);
    expect(isDeparture(page({ default_staff: false }), 'staff', false)).toBe(false);
  });

  it('is true when the admin actually changed something', () => {
    expect(isDeparture(page(), 'staff', false)).toBe(true);
    expect(isDeparture(page({ default_staff: false }), 'staff', true)).toBe(true);
  });

  it('judges each role against its own default', () => {
    const p = page({ default_staff: true, default_viewer: false });
    expect(isDeparture(p, 'staff', true)).toBe(false);
    expect(isDeparture(p, 'viewer', true)).toBe(true);
  });

  /**
   * The regression this exists to stop: a page saved as "allowed" while the
   * default was already "allowed" used to be stored, and then went on winning
   * over the default after a migration widened it.
   */
  it('does not store a row that would later shadow a widened default', () => {
    const before = page({ default_staff: false });
    expect(isDeparture(before, 'staff', false)).toBe(false);
    const after = page({ default_staff: true });
    expect(isDeparture(after, 'staff', true)).toBe(false);
  });
});
