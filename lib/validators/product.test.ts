import { describe, it, expect } from 'vitest';
import { productSchemaFor, salePriceIsUnset } from '@/lib/validators/product';

const base = {
  name: 'Engine Oil 20W-50',
  unit: 'Litre',
  sale_price_paisa: 250_000,
  purchase_price_paisa: 220_000,
  pack_size: 1,
  is_active: true,
};

/** A copy of the fixture without one key, for "the field was never sent" cases. */
function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/** The first message for a given field, or undefined when that field passed. */
function errorOn(result: ReturnType<ReturnType<typeof productSchemaFor>['safeParse']>, field: string) {
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === field)?.message;
}

describe('purchase price is required of roles that can see it', () => {
  it('rejects a missing purchase price for admin/accountant', () => {
    const r = productSchemaFor(true).safeParse({ ...base, purchase_price_paisa: null });
    expect(r.success).toBe(false);
    expect(errorOn(r, 'purchase_price_paisa')).toMatch(/required/i);
  });

  it('rejects an omitted purchase price for admin/accountant', () => {
    const withoutCost = omit(base, 'purchase_price_paisa');
    expect(productSchemaFor(true).safeParse(withoutCost).success).toBe(false);
  });

  it('accepts a missing purchase price for staff, who cannot see the field', () => {
    const r = productSchemaFor(false).safeParse({ ...base, purchase_price_paisa: null });
    expect(r.success).toBe(true);
  });

  it('still accepts a supplied purchase price for admin/accountant', () => {
    expect(productSchemaFor(true).safeParse(base).success).toBe(true);
  });
});

describe('sale price is optional', () => {
  it('accepts a product with no sale price at all', () => {
    const r = productSchemaFor(true).safeParse(omit(base, 'sale_price_paisa'));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sale_price_paisa).toBe(0);
  });

  it('treats 0 and null as "not set", and a real price as set', () => {
    expect(salePriceIsUnset(0)).toBe(true);
    expect(salePriceIsUnset(null)).toBe(true);
    expect(salePriceIsUnset(undefined)).toBe(true);
    expect(salePriceIsUnset(1)).toBe(false);
    expect(salePriceIsUnset(250_000)).toBe(false);
  });
});

describe('both prices reject bad money', () => {
  for (const canSeeCost of [true, false]) {
    const label = canSeeCost ? 'admin' : 'staff';

    it(`rejects a negative sale price (${label})`, () => {
      const r = productSchemaFor(canSeeCost).safeParse({ ...base, sale_price_paisa: -1 });
      expect(errorOn(r, 'sale_price_paisa')).toMatch(/negative/i);
    });

    it(`rejects a non-numeric sale price (${label})`, () => {
      const r = productSchemaFor(canSeeCost).safeParse({ ...base, sale_price_paisa: NaN });
      expect(r.success).toBe(false);
    });

    it(`rejects a fractional paisa sale price (${label})`, () => {
      const r = productSchemaFor(canSeeCost).safeParse({ ...base, sale_price_paisa: 10.5 });
      expect(r.success).toBe(false);
    });
  }

  it('rejects a negative purchase price', () => {
    const r = productSchemaFor(true).safeParse({ ...base, purchase_price_paisa: -1 });
    expect(errorOn(r, 'purchase_price_paisa')).toMatch(/negative/i);
  });

  it('rejects a non-numeric purchase price', () => {
    expect(
      productSchemaFor(true).safeParse({ ...base, purchase_price_paisa: NaN }).success,
    ).toBe(false);
  });
});

describe('the pack rules still hold after the price change', () => {
  it('rejects a pack and unit sharing a name', () => {
    const r = productSchemaFor(true).safeParse({
      ...base, unit: 'Box', pack_name: 'Box', pack_size: 12,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a container as the base unit of a packed product', () => {
    const r = productSchemaFor(true).safeParse({
      ...base, unit: 'Carton', pack_name: 'Box', pack_size: 12,
    });
    expect(errorOn(r, 'unit')).toMatch(/inside the pack/i);
  });

  it('accepts a well-formed pack', () => {
    const r = productSchemaFor(true).safeParse({
      ...base, unit: 'Piece', pack_name: 'Carton', pack_size: 24,
    });
    expect(r.success).toBe(true);
  });
});
