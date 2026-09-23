import { describe, it, expect } from 'vitest';
import { customerSchema, customerUpdateSchema } from './customer';

const base = { name: 'Rashid Traders', phone: '03001234567' };

describe('customerUpdateSchema keeps an edit away from the balance', () => {
  it('drops opening_balance_paisa even when it is sent', () => {
    // The form's defaultValues carry it, and a crafted request could set it to
    // anything. Either way it must not survive into the UPDATE.
    const parsed = customerUpdateSchema.parse({ ...base, opening_balance_paisa: 999_999 });
    expect(parsed).not.toHaveProperty('opening_balance_paisa');
  });

  it('does not invent a zero for it when absent', () => {
    // This is the dangerous case: customerSchema has .default(0), so a payload
    // without the field used to produce 0 — which, written to the column,
    // would silently wipe a customer's opening balance.
    const parsed = customerUpdateSchema.parse(base);
    expect(parsed).not.toHaveProperty('opening_balance_paisa');
  });

  it('still lets an edit change everything it legitimately should', () => {
    const parsed = customerUpdateSchema.parse({
      ...base, address: 'Jhang Road', notes: 'pays on time', credit_limit_paisa: 5_000_00,
    });
    expect(parsed.name).toBe('Rashid Traders');
    expect(parsed.address).toBe('Jhang Road');
    expect(parsed.credit_limit_paisa).toBe(500_000);
  });
});

describe('customerSchema still carries it, because creating one needs it', () => {
  it('defaults an absent opening balance to zero on create', () => {
    expect(customerSchema.parse(base).opening_balance_paisa).toBe(0);
  });

  it('accepts a stated opening balance on create', () => {
    expect(customerSchema.parse({ ...base, opening_balance_paisa: 500_000 })
      .opening_balance_paisa).toBe(500_000);
  });
});
