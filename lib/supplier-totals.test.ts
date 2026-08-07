import { describe, it, expect } from 'vitest';
import { purchaseTotalPaisa, computeSupplierAccount } from './supplier-totals';
import { rupeesToPaisa } from './money';

const R = (rupees: number) => rupees * 100;

describe('purchaseTotalPaisa', () => {
  it('multiplies whole litres by a whole rupee price', () => {
    // 40 ltr @ Rs 1,500.00 = Rs 60,000.00
    expect(purchaseTotalPaisa(40, R(1_500))).toBe(R(60_000));
  });

  it('handles fractional quantity — the case an INTEGER column would lose', () => {
    // 20.5 ltr @ Rs 1,300.00 = Rs 26,650.00
    expect(purchaseTotalPaisa(20.5, R(1_300))).toBe(R(26_650));
  });

  it('agrees with the value the SQL layer stores for the seeded fixtures', () => {
    // Both asserted against Postgres in the 0040 migration test run.
    expect(purchaseTotalPaisa(40, 150_000)).toBe(6_000_000);
    expect(purchaseTotalPaisa(20.5, 130_000)).toBe(2_665_000);
  });

  it('rounds to whole paisa rather than carrying a fraction', () => {
    // 0.333 ltr @ Rs 10.00 = 333 paisa exactly
    expect(purchaseTotalPaisa(0.333, 1_000)).toBe(333);
    // 1.005 ltr @ Rs 3.33 = 334.665 paisa -> 335
    expect(purchaseTotalPaisa(1.005, 333)).toBe(335);
    expect(Number.isInteger(purchaseTotalPaisa(1.005, 333))).toBe(true);
  });

  it('never returns a float, even for awkward decimal input', () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point
    const total = purchaseTotalPaisa(0.3, 999);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(300);
  });

  it('is 0 for non-finite input instead of NaN leaking into the books', () => {
    expect(purchaseTotalPaisa(NaN, 1_000)).toBe(0);
    expect(purchaseTotalPaisa(5, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('matches rupeesToPaisa on the form path', () => {
    // The modal collects rupees and converts before multiplying.
    expect(purchaseTotalPaisa(12, rupeesToPaisa(1_250.5))).toBe(R(15_006));
  });
});

describe('computeSupplierAccount', () => {
  it('reports what we owe when purchases exceed payments', () => {
    const a = computeSupplierAccount({
      totalPurchasedPaisa: R(96_650),
      totalPaidPaisa: R(50_000),
    });
    expect(a).not.toBeNull();
    expect(a!.balanceDuePaisa).toBe(R(46_650));
    expect(a!.weOwe).toBe(true);
    expect(a!.inCredit).toBe(false);
    expect(a!.settled).toBe(false);
  });

  it('reports credit when we overpaid a supplier', () => {
    const a = computeSupplierAccount({
      totalPurchasedPaisa: 0,
      totalPaidPaisa: R(2_500),
    });
    expect(a!.balanceDuePaisa).toBe(R(-2_500));
    expect(a!.inCredit).toBe(true);
    expect(a!.weOwe).toBe(false);
  });

  it('reports settled when the account is exactly square', () => {
    const a = computeSupplierAccount({
      totalPurchasedPaisa: R(10_000),
      totalPaidPaisa: R(10_000),
    });
    expect(a!.balanceDuePaisa).toBe(0);
    expect(a!.settled).toBe(true);
    expect(a!.weOwe).toBe(false);
    expect(a!.inCredit).toBe(false);
  });

  it('matches the balance Postgres computed for the seeded supplier', () => {
    // supplier_balance_view returned 9,665,000 - 5,000,000 = 4,665,000
    const a = computeSupplierAccount({
      totalPurchasedPaisa: 9_665_000,
      totalPaidPaisa: 5_000_000,
    });
    expect(a!.balanceDuePaisa).toBe(4_665_000);
  });

  it('returns null when the role may not see money, never a misleading zero', () => {
    expect(
      computeSupplierAccount({ totalPurchasedPaisa: null, totalPaidPaisa: null }),
    ).toBeNull();
    expect(
      computeSupplierAccount({ totalPurchasedPaisa: R(100), totalPaidPaisa: null }),
    ).toBeNull();
    expect(
      computeSupplierAccount({ totalPurchasedPaisa: null, totalPaidPaisa: R(100) }),
    ).toBeNull();
  });

  it('stays in integer paisa on odd amounts', () => {
    const a = computeSupplierAccount({
      totalPurchasedPaisa: 3_333_333,
      totalPaidPaisa: 1_111_111,
    });
    expect(a!.balanceDuePaisa).toBe(2_222_222);
    expect(Number.isInteger(a!.balanceDuePaisa)).toBe(true);
  });
});
