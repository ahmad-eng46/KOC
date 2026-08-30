import { describe, it, expect } from 'vitest';
import { parentRoute, backLabel } from '@/lib/navigation/parent-route';

describe('parentRoute', () => {
  it('walks a detail route up one level at a time', () => {
    expect(parentRoute('/products/abc-123/edit')).toBe('/products/abc-123');
    expect(parentRoute('/products/abc-123')).toBe('/products');
    expect(parentRoute('/products')).toBe('/dashboard');
    expect(parentRoute('/dashboard')).toBeNull();
  });

  it('hides itself where there is no parent to offer', () => {
    for (const p of ['/dashboard', '/login', '/change-password', '/no-access', '/unauthorized']) {
      expect(parentRoute(p)).toBeNull();
    }
  });

  it('sends every list page to the dashboard', () => {
    for (const p of ['/customers', '/invoices', '/payments', '/stock', '/profile', '/approvals']) {
      expect(parentRoute(p)).toBe('/dashboard');
    }
  });

  it('keeps nested detail routes on their own record', () => {
    expect(parentRoute('/invoices/inv-1/return')).toBe('/invoices/inv-1');
    expect(parentRoute('/settings/users/u-1')).toBe('/settings/users');
  });

  it('collapses every report onto the reports index', () => {
    for (const p of ['/reports/pl', '/reports/sales-analytics', '/reports/cash-book']) {
      expect(parentRoute(p)).toBe('/reports');
    }
    expect(parentRoute('/reports')).toBe('/dashboard');
  });

  it('never sends a staff user to a page they cannot open', () => {
    // /settings is admin-only; these three are not. Dropping a segment would
    // land staff on /unauthorized.
    expect(parentRoute('/settings/brands')).toBe('/products');
    expect(parentRoute('/settings/customer-categories')).toBe('/customers');
    expect(parentRoute('/settings/expense-assets')).toBe('/expenses');
    expect(parentRoute('/settings/activity-log')).toBe('/dashboard');
  });

  it('sends a return to the invoices it belongs to, having no list of its own', () => {
    expect(parentRoute('/returns/new')).toBe('/invoices');
  });

  it('ignores query strings, hashes and trailing slashes', () => {
    expect(parentRoute('/products/123?tab=stock')).toBe('/products');
    expect(parentRoute('/products/')).toBe('/dashboard');
    expect(parentRoute('/reports/sales#top')).toBe('/reports');
  });

  it('works for a route nobody has written yet', () => {
    expect(parentRoute('/customers/c-1/statements/2026')).toBe('/customers/c-1/statements');
  });
});

describe('backLabel', () => {
  it('names the section it returns to', () => {
    expect(backLabel('/products')).toBe('Back to products');
    expect(backLabel('/settings/users')).toBe('Back to users');
    expect(backLabel('/reports')).toBe('Back to reports');
  });

  it('says plain Back rather than reading an id aloud', () => {
    expect(backLabel('/invoices/7f3b9a12-4c5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe('Back');
  });

  it('turns a slug into words', () => {
    expect(backLabel('/settings/customer-categories')).toBe('Back to customer categories');
  });
});
