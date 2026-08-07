import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from './invoice-totals';

const R = (rupees: number) => rupees * 100;

describe('computeInvoiceTotals', () => {
  it('matches the worked example from the spec', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(86_000),
      discount_paisa: R(1_000),
      total_paisa: R(85_000),
      paid_paisa: R(100_000),
      previous_balance_paisa: R(65_000),
    });

    expect(t.invoiceTotalPaisa).toBe(R(85_000));
    expect(t.previousBalancePaisa).toBe(R(65_000));
    expect(t.totalDuePaisa).toBe(R(150_000));
    expect(t.paidPaisa).toBe(R(100_000));
    expect(t.balanceDuePaisa).toBe(R(50_000));
    expect(t.showPreviousBalance).toBe(true);
  });

  it('falls back to the simple view when previous balance is 0', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(5_000),
      discount_paisa: 0,
      total_paisa: R(5_000),
      paid_paisa: R(2_000),
      previous_balance_paisa: 0,
    });

    expect(t.showPreviousBalance).toBe(false);
    expect(t.totalDuePaisa).toBe(R(5_000));
    // Simple view: balance due is exactly the old total − paid.
    expect(t.balanceDuePaisa).toBe(R(3_000));
  });

  it('treats a null previous balance as zero (simple view, never a wrong number)', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(1_000),
      discount_paisa: 0,
      total_paisa: R(1_000),
      paid_paisa: 0,
      previous_balance_paisa: null,
    });

    expect(t.previousBalancePaisa).toBe(0);
    expect(t.showPreviousBalance).toBe(false);
    expect(t.balanceDuePaisa).toBe(R(1_000));
  });

  it('shows the full view for a credit (negative) previous balance', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(10_000),
      discount_paisa: 0,
      total_paisa: R(10_000),
      paid_paisa: 0,
      previous_balance_paisa: R(-4_000),
    });

    expect(t.showPreviousBalance).toBe(true);
    expect(t.hasCreditPrevious).toBe(true);
    expect(t.totalDuePaisa).toBe(R(6_000));
    expect(t.balanceDuePaisa).toBe(R(6_000));
    expect(t.isCreditBalance).toBe(false);
  });

  it("subtracts a previous credit from Total Amount Due (the spec's Rs -5,000 + Rs 85,000 case)", () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(85_000),
      discount_paisa: 0,
      total_paisa: R(85_000),
      paid_paisa: 0,
      previous_balance_paisa: R(-5_000),
    });

    expect(t.totalDuePaisa).toBe(R(80_000));
    expect(t.hasCreditPrevious).toBe(true);
  });

  it('flags overpayment across the account as a credit balance', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(1_000),
      discount_paisa: 0,
      total_paisa: R(1_000),
      paid_paisa: R(3_000),
      previous_balance_paisa: R(500),
    });

    expect(t.totalDuePaisa).toBe(R(1_500));
    expect(t.balanceDuePaisa).toBe(R(-1_500));
    expect(t.isCreditBalance).toBe(true);
    expect(t.hasCreditPrevious).toBe(false);
  });

  it("matches the spec's Credit Balance example: 1,50,000 due, 1,75,000 paid → 25,000 credit", () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(85_000),
      discount_paisa: 0,
      total_paisa: R(85_000),
      paid_paisa: R(175_000),
      previous_balance_paisa: R(65_000),
    });

    expect(t.totalDuePaisa).toBe(R(150_000));
    expect(t.balanceDuePaisa).toBe(R(-25_000));
    expect(t.isCreditBalance).toBe(true);
  });

  it('khata sale: no payment means the balance is the full amount due', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(85_000),
      discount_paisa: 0,
      total_paisa: R(85_000),
      paid_paisa: 0,
      previous_balance_paisa: R(65_000),
    });

    expect(t.balanceDuePaisa).toBe(t.totalDuePaisa);
    expect(t.balanceDuePaisa).toBe(R(150_000));
  });

  it('fully settled account: everything cleared shows exactly zero', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: R(85_000),
      discount_paisa: 0,
      total_paisa: R(85_000),
      paid_paisa: R(150_000),
      previous_balance_paisa: R(65_000),
    });

    expect(t.balanceDuePaisa).toBe(0);
    expect(t.isCreditBalance).toBe(false);
  });

  it('stays in integer paisa — no float drift on odd amounts', () => {
    const t = computeInvoiceTotals({
      subtotal_paisa: 3_333_333,
      discount_paisa: 1,
      total_paisa: 3_333_332,
      paid_paisa: 1_111_111,
      previous_balance_paisa: 6_666_667,
    });

    expect(t.totalDuePaisa).toBe(9_999_999);
    expect(t.balanceDuePaisa).toBe(8_888_888);
    expect(Number.isInteger(t.totalDuePaisa)).toBe(true);
    expect(Number.isInteger(t.balanceDuePaisa)).toBe(true);
  });
});
