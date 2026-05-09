import { describe, it, expect } from 'vitest';
import { formatPKR, parsePKR, rupeesToPaisa, paisaToRupees, applyDiscount, applyDiscountPercent } from './money';

describe('formatPKR', () => {
  it('formats 0 paisa', () => expect(formatPKR(0)).toBe('Rs. 0.00'));
  it('formats 1 paisa', () => expect(formatPKR(1)).toBe('Rs. 0.01'));
  it('formats 99 paisa', () => expect(formatPKR(99)).toBe('Rs. 0.99'));
  it('formats 100 paisa = Rs 1', () => expect(formatPKR(100)).toBe('Rs. 1.00'));
  it('formats 50050 paisa = Rs 500.50', () => expect(formatPKR(50050)).toBe('Rs. 500.50'));
  it('formats 99999999 paisa', () => expect(formatPKR(99999999)).toBe('Rs. 999,999.99'));
  it('hides symbol when showSymbol=false', () => expect(formatPKR(100, { showSymbol: false })).toBe('1.00'));
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
