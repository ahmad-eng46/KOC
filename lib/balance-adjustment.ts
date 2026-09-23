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

export type BalanceField = 'outstanding' | 'opening';
export type PartyType = 'customer' | 'supplier';

/**
 * Which way the money moves, in words.
 *
 * A sign is not enough. "+5,000" against a supplier means the business owes
 * more; the same figure against a customer means the customer does. Debit and
 * credit confusion is the expensive mistake here, so the dialog says which it
 * is in a sentence rather than leaving it to be inferred.
 */
export function describeDirection(party: PartyType, differencePaisa: Money): string {
  if (differencePaisa === 0) return 'No change.';
  const up = differencePaisa > 0;
  if (party === 'customer') {
    return up ? 'Increases what this customer owes you.' : 'Reduces what this customer owes you.';
  }
  return up ? 'Increases what you owe this supplier.' : 'Reduces what you owe this supplier.';
}

/**
 * Is this correction large enough to be worth a second look?
 *
 * Warn, never block — the admin may well be right, and a correction that is
 * refused for being large is a correction made some other, worse way. The
 * comparison is against the biggest single transaction on the account, which
 * is a far better yardstick than a fixed rupee figure: Rs. 50,000 is routine
 * for one party and alarming for another.
 *
 * A party with no history has nothing to compare against, so nothing is said.
 */
export function adjustmentLooksLarge(
  differencePaisa: Money,
  largestTransactionPaisa: Money,
): boolean {
  const size = Math.abs(differencePaisa);
  if (size === 0) return false;
  if (largestTransactionPaisa <= 0) return false;
  return size > largestTransactionPaisa * 2;
}

/** Today in Karachi, as the date input expects it. Adjustments may not be later. */
export function isFutureDate(iso: string, today: string): boolean {
  if (!iso) return false;
  return iso > today;
}
