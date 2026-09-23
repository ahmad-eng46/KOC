import { parseMoneyInput, type Money } from '@/lib/money';

/**
 * What a balance correction would do, worked out from what the admin typed.
 *
 * Pure, and separate from the dialog, because this is the one piece of the
 * feature that is arithmetic on money: the difference that gets posted to the
 * ledger. A dialog can be eyeballed; a subtraction that silently treats "abc"
 * as zero cannot, and that is exactly how a customer's balance would be
 * cleared by a typo.
 */
export type Adjustment = {
  /** The balance the admin is asking for, or NaN when what they typed is not a number. */
  targetPaisa: Money;
  /** What would be posted: positive debits the customer, negative credits them. */
  differencePaisa: Money;
  /** The target parsed cleanly. */
  valid: boolean;
  /** There is something to post — a valid target that differs from today's. */
  postable: boolean;
};

export function describeAdjustment(currentPaisa: Money, targetText: string): Adjustment {
  const targetPaisa = parseMoneyInput(targetText);
  const valid = Number.isFinite(targetPaisa);
  const differencePaisa = valid ? targetPaisa - currentPaisa : 0;

  return {
    targetPaisa,
    differencePaisa,
    valid,
    postable: valid && differencePaisa !== 0,
  };
}

/** A reason is required, and a reason has to say something. */
export function reasonIsAdequate(reason: string): boolean {
  return reason.trim().length >= 3;
}
