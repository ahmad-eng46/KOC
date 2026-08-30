import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals, parseRateInput, formatRateInput } from '@/lib/invoice';

describe('parseRateInput', () => {
  it('reads whole rupees and paisa exactly', () => {
    expect(parseRateInput('500')).toEqual({ ok: true, paisa: 50000 });
    expect(parseRateInput('500.50')).toEqual({ ok: true, paisa: 50050 });
    expect(parseRateInput('0')).toEqual({ ok: true, paisa: 0 });
    expect(parseRateInput('0.01')).toEqual({ ok: true, paisa: 1 });
  });

  it('is exact where a float round-trip is not', () => {
    // 19.99 * 100 === 1998.9999999999998 in IEEE-754.
    expect(parseRateInput('19.99')).toEqual({ ok: true, paisa: 1999 });
    expect(parseRateInput('1234.565')).toMatchObject({ ok: false });
    expect(parseRateInput('8.29')).toEqual({ ok: true, paisa: 829 });
  });

  it('pads a short fraction rather than truncating it', () => {
    expect(parseRateInput('12.5')).toEqual({ ok: true, paisa: 1250 });
    expect(parseRateInput('12.')).toEqual({ ok: true, paisa: 1200 });
  });

  it('tolerates surrounding space and lakh grouping', () => {
    expect(parseRateInput('  1,50,000.25 ')).toEqual({ ok: true, paisa: 15000025 });
  });

  it('rejects rather than silently zeroing', () => {
    expect(parseRateInput('')).toMatchObject({ ok: false, error: 'Enter a rate' });
    expect(parseRateInput('abc')).toMatchObject({ ok: false, error: 'Rate must be a number' });
    expect(parseRateInput('12abc')).toMatchObject({ ok: false, error: 'Rate must be a number' });
    expect(parseRateInput('1e5')).toMatchObject({ ok: false, error: 'Rate must be a number' });
    expect(parseRateInput('.')).toMatchObject({ ok: false, error: 'Rate must be a number' });
  });

  it('rejects negative rates', () => {
    expect(parseRateInput('-1')).toMatchObject({ ok: false, error: 'Rate cannot be negative' });
    expect(parseRateInput('-0.01')).toMatchObject({ ok: false, error: 'Rate cannot be negative' });
  });

  it('rejects sub-paisa precision and absurd magnitudes', () => {
    expect(parseRateInput('1.005')).toMatchObject({ ok: false });
    expect(parseRateInput('99999999999')).toMatchObject({ ok: false, error: 'Rate is too large' });
  });

  it('round-trips through the box display', () => {
    for (const paisa of [0, 1, 829, 50050, 15000025]) {
      expect(parseRateInput(formatRateInput(paisa))).toEqual({ ok: true, paisa });
    }
  });
});

describe('an overridden rate flows through the totals', () => {
  const line = (quantity: number, rate: string) => ({
    quantity,
    unit_price_paisa: (parseRateInput(rate) as { ok: true; paisa: number }).paisa,
  });

  it('prices the line at the override, not the product price', () => {
    const totals = computeInvoiceTotals([line(3, '450.50')], 'none', 0);
    expect(totals.line_totals_paisa).toEqual([135150]);
    expect(totals.subtotal_paisa).toBe(135150);
    expect(totals.total_paisa).toBe(135150);
  });

  it('recomputes subtotal and grand total across mixed overridden lines', () => {
    const totals = computeInvoiceTotals(
      [line(2, '100'), line(1.5, '333.33'), line(10, '0')],
      'percent',
      10,
    );
    expect(totals.line_totals_paisa).toEqual([20000, 50000, 0]);
    expect(totals.subtotal_paisa).toBe(70000);
    expect(totals.discount_paisa).toBe(7000);
    expect(totals.total_paisa).toBe(63000);
  });

  it('keeps a fractional-quantity line on a whole paisa', () => {
    const totals = computeInvoiceTotals([line(0.333, '999.99')], 'none', 0);
    expect(Number.isInteger(totals.subtotal_paisa)).toBe(true);
    expect(totals.subtotal_paisa).toBe(33300);
  });

  it('never lets a fixed discount drive the total below zero', () => {
    const totals = computeInvoiceTotals([line(1, '50')], 'fixed', 999999);
    expect(totals.total_paisa).toBe(0);
    expect(totals.discount_paisa).toBe(5000);
  });
});
