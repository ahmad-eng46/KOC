import { describe, it, expect } from 'vitest';
import { formatPKR, parseMoneyInput } from './money';
import {
  describeAdjustment, reasonIsAdequate, describeDirection,
  adjustmentLooksLarge, isFutureDate,
} from './balance-adjustment';

describe('describeAdjustment', () => {
  it('posts the difference between what is owed and what should be', () => {
    // Owes Rs. 15,000, should owe Rs. 12,000 → credit him Rs. 3,000.
    const a = describeAdjustment(1_500_000, '12000');
    expect(a.targetPaisa).toBe(1_200_000);
    expect(a.differencePaisa).toBe(-300_000);
    expect(a.postable).toBe(true);
  });

  it('debits when the customer owes more than recorded', () => {
    const a = describeAdjustment(1_200_000, '15000');
    expect(a.differencePaisa).toBe(300_000);
  });

  it('reads a grouped figure the way it is displayed', () => {
    // The field is seeded from formatPKR, which writes "9,600.00".
    expect(describeAdjustment(0, '9,600.00').targetPaisa).toBe(960_000);
  });

  it('keeps the paisa', () => {
    expect(describeAdjustment(0, '1234.56').targetPaisa).toBe(123_456);
  });

  it('refuses a target that is not a number rather than reading it as zero', () => {
    const a = describeAdjustment(1_500_000, 'abc');
    expect(a.valid).toBe(false);
    expect(a.postable).toBe(false);
    // The point of the test: nothing is posted, so the balance is not wiped.
    expect(a.differencePaisa).toBe(0);
  });

  it('treats an empty field as zero, not as invalid', () => {
    // Zero is a legitimate target: settling an account in full.
    const a = describeAdjustment(500_000, '');
    expect(a.valid).toBe(true);
    expect(a.differencePaisa).toBe(-500_000);
  });

  it('has nothing to post when the balance is already right', () => {
    const a = describeAdjustment(500_000, '5000');
    expect(a.valid).toBe(true);
    expect(a.postable).toBe(false);
  });

  it('carries a negative target through as an overpayment', () => {
    const a = describeAdjustment(0, '-2500');
    expect(a.targetPaisa).toBe(-250_000);
    expect(a.differencePaisa).toBe(-250_000);
  });

  it('stays in whole paisa', () => {
    // 0.1 + 0.2 territory: the reason money is never a float here.
    const a = describeAdjustment(10, '0.30');
    expect(Number.isInteger(a.targetPaisa)).toBe(true);
    expect(a.differencePaisa).toBe(20);
  });
});

describe('reasonIsAdequate', () => {
  it('rejects nothing and whitespace', () => {
    expect(reasonIsAdequate('')).toBe(false);
    expect(reasonIsAdequate('   ')).toBe(false);
  });

  it('rejects a token gesture', () => {
    expect(reasonIsAdequate('x')).toBe(false);
  });

  it('accepts a stated reason', () => {
    expect(reasonIsAdequate('cash payment missed')).toBe(true);
  });
});

describe('describeDirection', () => {
  it('says whose money it is, per party', () => {
    expect(describeDirection('customer', 500)).toMatch(/customer owes you/);
    expect(describeDirection('customer', -500)).toMatch(/Reduces what this customer owes/);
    expect(describeDirection('supplier', 500)).toMatch(/you owe this supplier/);
    expect(describeDirection('supplier', -500)).toMatch(/Reduces what you owe/);
  });

  it('does not claim a direction when nothing moves', () => {
    expect(describeDirection('customer', 0)).toBe('No change.');
  });
});

describe('adjustmentLooksLarge', () => {
  it('warns when the correction dwarfs the biggest transaction', () => {
    expect(adjustmentLooksLarge(1_000_000, 100_000)).toBe(true);
  });

  it('stays quiet for a correction in the ordinary range', () => {
    expect(adjustmentLooksLarge(50_000, 100_000)).toBe(false);
  });

  it('stays quiet at exactly twice, warning only beyond it', () => {
    expect(adjustmentLooksLarge(200_000, 100_000)).toBe(false);
    expect(adjustmentLooksLarge(200_001, 100_000)).toBe(true);
  });

  it('says nothing about a party with no history to judge against', () => {
    expect(adjustmentLooksLarge(1_000_000, 0)).toBe(false);
  });

  it('judges a credit by its size, not its sign', () => {
    expect(adjustmentLooksLarge(-1_000_000, 100_000)).toBe(true);
  });
});

describe('isFutureDate', () => {
  it('rejects tomorrow', () => {
    expect(isFutureDate('2026-09-24', '2026-09-23')).toBe(true);
  });

  it('allows today and the past', () => {
    expect(isFutureDate('2026-09-23', '2026-09-23')).toBe(false);
    expect(isFutureDate('2020-01-01', '2026-09-23')).toBe(false);
  });
});

describe('the dialog seeds its input from formatPKR, so it must read back', () => {
  // The target field opens showing the current balance, formatted. If the
  // parser could not read its own formatter's output, opening the dialog and
  // pressing Review would post a different number than the one displayed.
  for (const paisa of [500_000, -500_000, 0, -1, 123_456, -98_765_432]) {
    it(`round-trips ${paisa} paisa`, () => {
      const shown = formatPKR(paisa, { showSymbol: false });
      expect(parseMoneyInput(shown)).toBe(paisa);
    });
  }

  it('lets a party in credit be corrected from a negative seed', () => {
    const a = describeAdjustment(-250_000, formatPKR(-250_000, { showSymbol: false }));
    expect(a.valid).toBe(true);
    expect(a.postable).toBe(false);
  });
});
