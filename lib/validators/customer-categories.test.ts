import { describe, it, expect } from 'vitest';
import {
  customerCategorySchema, quickCategorySchema, customerCategoryUpdateSchema,
  isHexColor, categoryColor,
} from '@/lib/validators/customer-categories';
import { customerSchema } from '@/lib/validators/customer';

describe('customerCategorySchema', () => {
  it('accepts a name alone and fills the defaults', () => {
    const r = customerCategorySchema.parse({ name: 'Retailer' });
    expect(r).toMatchObject({ name: 'Retailer', sort_order: 0, is_active: true });
  });

  it('trims the name before length is judged', () => {
    expect(customerCategorySchema.parse({ name: '  Workshop  ' }).name).toBe('Workshop');
    expect(customerCategorySchema.safeParse({ name: '  a  ' }).success).toBe(false);
  });

  it('rejects a name under 2 characters or over 50', () => {
    expect(customerCategorySchema.safeParse({ name: 'R' }).success).toBe(false);
    expect(customerCategorySchema.safeParse({ name: 'x'.repeat(51) }).success).toBe(false);
  });

  it('accepts both hex forms and an empty colour', () => {
    for (const color of ['#FF5733', '#f53', '']) {
      expect(customerCategorySchema.safeParse({ name: 'Ok', color }).success).toBe(true);
    }
  });

  it('rejects a colour that is not hex', () => {
    for (const color of ['red', 'FF5733', '#GGGGGG', '#ff573']) {
      const r = customerCategorySchema.safeParse({ name: 'Bad', color });
      expect(r.success, color).toBe(false);
    }
  });
});

describe('quickCategorySchema', () => {
  it('asks for a name and nothing else — that is the whole point', () => {
    expect(Object.keys(quickCategorySchema.shape)).toEqual(['name']);
    expect(quickCategorySchema.parse({ name: 'Mechanic' })).toEqual({ name: 'Mechanic' });
  });
});

describe('customerCategoryUpdateSchema', () => {
  it('accepts a partial edit', () => {
    expect(customerCategoryUpdateSchema.parse({ sort_order: 5 })).toEqual({ sort_order: 5 });
    expect(customerCategoryUpdateSchema.parse({})).toEqual({});
  });

  it('emits nothing it was not given — no default may sneak into an edit', () => {
    // .partial() would leave the .default() in place, so renaming a category
    // would also reset its order to 0 and reactivate a disabled one.
    const parsed = customerCategoryUpdateSchema.parse({ name: 'Renamed' });
    expect(parsed).toEqual({ name: 'Renamed' });
    expect(parsed).not.toHaveProperty('sort_order');
    expect(parsed).not.toHaveProperty('is_active');
  });

  it('still refuses a bad colour on a partial edit', () => {
    expect(customerCategoryUpdateSchema.safeParse({ color: 'blue' }).success).toBe(false);
  });
});

describe('customerSchema carries category_id', () => {
  // The brief warned about a field that exists in the form but never reaches
  // the database. createCustomer/updateCustomer spread parsed.data, so the
  // question is whether the schema preserves the field at all.
  it('keeps a chosen category through parsing', () => {
    const parsed = customerSchema.parse({
      name: 'Ali', opening_balance_paisa: 0,
      category_id: '00000003-0000-0000-0000-000000000001',
    });
    expect(parsed.category_id).toBe('00000003-0000-0000-0000-000000000001');
  });

  it('keeps an explicit null, so clearing a category actually clears it', () => {
    const parsed = customerSchema.parse({ name: 'Ali', opening_balance_paisa: 0, category_id: null });
    expect(parsed).toHaveProperty('category_id', null);
  });

  it('is still valid with no category at all', () => {
    expect(customerSchema.safeParse({ name: 'Ali', opening_balance_paisa: 0 }).success).toBe(true);
  });
});

describe('isHexColor', () => {
  it('matches the database CHECK constraint', () => {
    expect(isHexColor('#FF5733')).toBe(true);
    expect(isHexColor('#f53')).toBe(true);
    expect(isHexColor('  #f53  ')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});

describe('categoryColor', () => {
  it('uses the stored colour when there is one', () => {
    expect(categoryColor('id-1', '#FF5733')).toBe('#FF5733');
  });

  it('ignores a stored colour that is malformed', () => {
    expect(categoryColor('id-1', 'red')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is stable per id, so a category keeps its colour everywhere', () => {
    expect(categoryColor('id-1', null)).toBe(categoryColor('id-1', null));
  });

  it('spreads several ids over more than one colour', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(new Set(ids.map((i) => categoryColor(i, null))).size).toBeGreaterThan(1);
  });
});
