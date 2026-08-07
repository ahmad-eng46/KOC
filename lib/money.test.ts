import { describe, it, expect } from 'vitest';
import { formatPKR, parsePKR, rupeesToPaisa, paisaToRupees, applyDiscount, applyDiscountPercent } from './money';

describe('formatPKR — Pakistani (lakh/crore) grouping', () => {
  it('formats 0 paisa', () => expect(formatPKR(0)).toBe('Rs. 0.00'));
  it('formats 1 paisa', () => expect(formatPKR(1)).toBe('Rs. 0.01'));
  it('formats 99 paisa', () => expect(formatPKR(99)).toBe('Rs. 0.99'));
  it('formats 100 paisa = Rs 1', () => expect(formatPKR(100)).toBe('Rs. 1.00'));
  it('formats 50050 paisa = Rs 500.50', () => expect(formatPKR(50050)).toBe('Rs. 500.50'));
  it('hides symbol when showSymbol=false', () => expect(formatPKR(100, { showSymbol: false })).toBe('1.00'));

  // The Pakistani number system: last three digits, then groups of two.
  it('groups thousands western-style below one lakh', () => {
    expect(formatPKR(100_000)).toBe('Rs. 1,000.00');
    expect(formatPKR(8_650_000, { showSymbol: false })).toBe('86,500.00');
    expect(formatPKR(9_999_900)).toBe('Rs. 99,999.00');
  });
  it('groups the spec example: 1,50,000 not 150,000', () => {
    expect(formatPKR(15_000_000)).toBe('Rs. 1,50,000.00');
  });
  it('switches to two-digit groups from one lakh upward', () => {
    expect(formatPKR(10_000_000)).toBe('Rs. 1,00,000.00'); // 1 lakh
    expect(formatPKR(99999999)).toBe('Rs. 9,99,999.99');
    expect(formatPKR(1_234_567_800)).toBe('Rs. 1,23,45,678.00'); // 1.23 crore
    expect(formatPKR(100_000_000_000)).toBe('Rs. 1,00,00,00,000.00'); // 1 arab
  });
  it('keeps paisa fractions exact around the grouping boundary', () => {
    expect(formatPKR(15_000_001)).toBe('Rs. 1,50,000.01');
  });
  it('handles negative amounts', () => {
    expect(formatPKR(-15_000_000)).toBe('Rs. -1,50,000.00');
    expect(formatPKR(-50, { showSymbol: false })).toBe('-0.50');
  });
  it('round-trips through parsePKR', () => {
    for (const paisa of [0, 99_900, 15_000_000, 1_234_567_800]) {
      expect(parsePKR(formatPKR(paisa))).toBe(paisa);
    }
  });
  it('parsePKR accepts both groupings', () => {
    expect(parsePKR('150,000')).toBe(rupeesToPaisa(150_000));
    expect(parsePKR('1,50,000')).toBe(rupeesToPaisa(150_000));
  });
});

describe('parsePKR', () => {
  it('parses "Rs. 500.50"', () => expect(parsePKR('Rs. 500.50')).toBe(50050));
  it('parses "500"', () => expect(parsePKR('500')).toBe(50000));
  it('parses "invalid" → 0', () => expect(parsePKR('invalid')).toBe(0));
  it('parses empty string → 0', () => expect(parsePKR('')).toBe(0));
  it('parses "0"', () => expect(parsePKR('0')).toBe(0));
});

describe('rupeesToPaisa', () => {
  it('converts 500.50 → 50050', () => expect(rupeesToPaisa(500.50)).toBe(50050));
  it('rounds floating point imprecision', () => expect(rupeesToPaisa(0.1 + 0.2)).toBe(30));
});

describe('paisaToRupees', () => {
  it('converts 50050 → 500.5', () => expect(paisaToRupees(50050)).toBe(500.5));
});

describe('applyDiscount', () => {
  it('subtracts discount', () => expect(applyDiscount(10000, 500)).toBe(9500));
  it('floors at 0', () => expect(applyDiscount(100, 200)).toBe(0));
});

describe('applyDiscountPercent', () => {
  it('applies 10%', () => expect(applyDiscountPercent(10000, 10)).toBe(9000));
  it('applies 0%', () => expect(applyDiscountPercent(10000, 0)).toBe(10000));
});
