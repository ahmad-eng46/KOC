import { describe, it, expect } from 'vitest';
import {
  resolveEffective, buildPermissionRow, buildPermissionRows, effectivePermissionSet,
} from '@/lib/auth/effective';
import { can } from '@/lib/auth/permissions';

describe('resolveEffective', () => {
  it('falls back to the role default when there is no override', () => {
    expect(resolveEffective(true, null)).toBe(true);
    expect(resolveEffective(false, null)).toBe(false);
  });

  it('grants against the role', () => {
    expect(resolveEffective(false, true)).toBe(true);
  });

  it('denies against the role', () => {
    expect(resolveEffective(true, false)).toBe(false);
  });

  it('treats undefined like an absent override', () => {
    expect(resolveEffective(true, undefined as unknown as null)).toBe(true);
  });
});

describe('buildPermissionRow', () => {
  it('reports the role default alongside the effective answer', () => {
    const row = buildPermissionRow('staff', 'payments.create', true);
    expect(row).toEqual({
      permission: 'payments.create',
      roleDefault: true,
      override: true,
      effective: true,
    });
  });

  it('shows a grant that departs from the role', () => {
    const row = buildPermissionRow('viewer', 'invoices.create', true);
    expect(row.roleDefault).toBe(false);
    expect(row.effective).toBe(true);
  });

  it('shows a deny that departs from the role', () => {
    const row = buildPermissionRow('accountant', 'reports.view', false);
    expect(row.roleDefault).toBe(true);
    expect(row.effective).toBe(false);
  });

  it('leaves admin at allowed for everything when not overridden', () => {
    expect(buildPermissionRow('admin', 'ledger.view', null).effective).toBe(true);
  });

  it('can deny even an admin', () => {
    expect(buildPermissionRow('admin', 'ledger.view', false).effective).toBe(false);
  });
});

describe('buildPermissionRows', () => {
  it('maps overrides by permission name and leaves the rest at role default', () => {
    const rows = buildPermissionRows(
      'staff',
      // users.manage is the middle row on purpose: it is one of the four
      // permissions staff are withheld, so it stays a genuine role-default
      // false. Picking a business permission here would make the test fail
      // the next time staff access widens, which is not what it is testing.
      ['invoices.create', 'users.manage', 'ledger.view'],
      new Map([['ledger.view', true]]),
    );
    expect(rows.map((r) => r.effective)).toEqual([true, false, true]);
    expect(rows[2].override).toBe(true);
    expect(rows[1].override).toBeNull();
  });
});

describe('effectivePermissionSet', () => {
  it('returns only what the user actually has', () => {
    const set = effectivePermissionSet(
      'viewer',
      ['customers.view', 'invoices.create', 'ledger.view'],
      new Map([['invoices.create', true]]),
    );
    expect(set).toEqual(['customers.view', 'invoices.create']);
  });

  it('matches can() exactly when there are no overrides', () => {
    const perms = ['customers.view', 'payments.create', 'ledger.view'] as const;
    const set = effectivePermissionSet('accountant', perms, new Map());
    expect(set).toEqual(perms.filter((p) => can('accountant', p)));
  });
});
