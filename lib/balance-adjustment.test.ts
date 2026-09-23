import { describe, it, expect } from 'vitest';
import { describeAdjustment, reasonIsAdequate } from './balance-adjustment';

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
