import { describe, it, expect } from 'vitest';
import { ENTITY_CONFIG, NO_DELETE_ACTION, describeDrift } from '@/lib/deletion/entity-registry';
import { deletableEntities, entityHref } from '@/lib/validators/deletion-requests';

describe('ENTITY_CONFIG', () => {
  it('covers every deletable entity — a gap would crash the request modal', () => {
    for (const entity of deletableEntities) {
      expect(ENTITY_CONFIG[entity], entity).toBeDefined();
      expect(ENTITY_CONFIG[entity].table, entity).toBeTruthy();
    }
  });

  it('selects deleted_at wherever it claims the entity soft-deletes', () => {
    for (const entity of deletableEntities) {
      const c = ENTITY_CONFIG[entity];
      if (c.softDeletes) expect(c.columns, entity).toContain('deleted_at');
    }
  });
});

describe('describe()', () => {
  it('titles an invoice by its number and warns about payments taken', () => {
    const d = ENTITY_CONFIG.invoice.describe({
      invoice_number: 'INV-00115', issue_date: '2026-08-08', status: 'partially_paid',
      total_paisa: 8500000, paid_paisa: 2000000, customers: { name: 'Ali' },
    });
    expect(d.displayName).toBe('Invoice #INV-00115');
    expect(d.details.find((x) => x.label === 'Customer')?.value).toBe('Ali');
    expect(d.details.find((x) => x.label === 'Amount')?.value).toContain('85,000');
    expect(d.warnings.join(' ')).toContain('payments recorded');
  });

  it('stays quiet about payments when none were taken', () => {
    const d = ENTITY_CONFIG.invoice.describe({
      invoice_number: 'INV-1', total_paisa: 1000, paid_paisa: 0, customers: null,
    });
    expect(d.warnings).toEqual([]);
    expect(d.details.find((x) => x.label === 'Customer')?.value).toBe('—');
  });

  it('always warns that deleting a payment leaves the ledger alone', () => {
    const attached = ENTITY_CONFIG.payment.describe({
      amount_paisa: 5000000, method: 'cash', payment_date: '2026-08-08',
      invoice_id: 'inv-1', customers: { name: 'Ali' },
    });
    const loose = ENTITY_CONFIG.payment.describe({
      amount_paisa: 5000000, method: 'cash', payment_date: '2026-08-08',
      invoice_id: null, customers: null,
    });
    expect(attached.warnings.join(' ')).toContain('ledger');
    expect(loose.warnings.join(' ')).toContain('ledger');
  });

  it('handles a joined name arriving as an array, which PostgREST sometimes does', () => {
    const d = ENTITY_CONFIG.product.describe({
      name: 'DH Motor Oil', sku: 'OIL-1', sale_price_paisa: 220000,
      brands: [{ name: 'Double Horse' }],
    });
    expect(d.details.find((x) => x.label === 'Brand')?.value).toBe('Double Horse');
  });

  it('says Unbranded rather than blank when a product has no brand', () => {
    const d = ENTITY_CONFIG.product.describe({ name: 'Air Filter', brands: null });
    expect(d.details.find((x) => x.label === 'Brand')?.value).toBe('Unbranded');
  });

  it('flags a defaulter customer', () => {
    const d = ENTITY_CONFIG.customer.describe({ name: 'Ali', is_defaulter: true });
    expect(d.warnings.join(' ')).toContain('defaulter');
  });

  it('names an expense by its category and amount', () => {
    const d = ENTITY_CONFIG.expense.describe({
      category: 'Transport', amount_paisa: 800000, expense_date: '2026-08-08',
      description: 'Petrol', asset_name: 'Car LHR-1234',
    });
    expect(d.displayName).toContain('Transport');
    expect(d.displayName).toContain('8,000');
  });
});

describe('NO_DELETE_ACTION', () => {
  it('names exactly the entities the app cannot yet delete', () => {
    expect([...NO_DELETE_ACTION].sort()).toEqual(['return', 'stock_purchase', 'supplier_payment']);
  });

  it('lists only entities that are otherwise describable', () => {
    for (const e of NO_DELETE_ACTION) expect(ENTITY_CONFIG[e]).toBeDefined();
  });
});

describe('describeDrift', () => {
  it('is empty when nothing moved', () => {
    expect(describeDrift({ total_paisa: 100, name: 'A' }, { total_paisa: 100, name: 'A' })).toEqual([]);
  });

  it('names the field and both values when something moved', () => {
    const drift = describeDrift({ paid_paisa: 0 }, { paid_paisa: 5000 });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain('paid_paisa');
    expect(drift[0]).toContain('5000');
  });

  it('treats a number and its string form as unchanged, since PostgREST may send either', () => {
    expect(describeDrift({ total_paisa: 100 }, { total_paisa: '100' })).toEqual([]);
  });

  it('does not report a field that was null and still is', () => {
    expect(describeDrift({ note: null }, { note: null })).toEqual([]);
  });

  it('reports a field that went from null to a value', () => {
    expect(describeDrift({ note: null }, { note: 'added' })[0]).toContain('note');
  });
});

describe('entityHref', () => {
  it('points at the detail page where there is one', () => {
    expect(entityHref('invoice', 'i1')).toBe('/invoices/i1');
    expect(entityHref('customer', 'c1')).toBe('/customers/c1');
  });

  it('falls back to the list page for entities with no detail page', () => {
    expect(entityHref('expense', 'e1')).toBe('/expenses');
  });

  it('returns null when there is nowhere sensible to go', () => {
    expect(entityHref('stock_purchase', 's1')).toBeNull();
  });
});
