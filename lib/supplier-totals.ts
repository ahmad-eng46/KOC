import type { Money } from '@/lib/money';

/**
 * Line total for a stock purchase, in paisa.
 *
 * MUST agree with create_stock_purchase_atomic(), which computes
 * ROUND(quantity * unit_price_paisa)::BIGINT, and with the
 * stock_purchases_total_matches_inputs CHECK constraint. The Add Purchase form
 * previews this value, so any disagreement would show the user one number and
 * store another.
 *
 * Postgres ROUND() on numeric is half-away-from-zero; JS Math.round() is
 * half-up (toward +∞), which differs for negative halves only. Quantity and
 * unit price are both constrained positive, so the two agree over the whole
 * allowed input range.
 */
export function purchaseTotalPaisa(quantity: number, unitPricePaisa: Money): Money {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPricePaisa)) return 0;
  return Math.round(quantity * unitPricePaisa);
}

export type SupplierAccount = {
  totalPurchasedPaisa: Money;
  totalPaidPaisa: Money;
  /** purchased − paid. Positive = we owe them, negative = we overpaid. */
  balanceDuePaisa: Money;
  weOwe: boolean;
  /** We paid more than we bought — the supplier holds our credit. */
  inCredit: boolean;
  settled: boolean;
};

/**
 * Derives the display shape of a supplier account from the two totals.
 *
 * Money is null when the current role may not see purchase prices, so callers
 * get null back rather than a misleading zero.
 */
export function computeSupplierAccount(input: {
  totalPurchasedPaisa: Money | null;
  totalPaidPaisa: Money | null;
}): SupplierAccount | null {
  const { totalPurchasedPaisa, totalPaidPaisa } = input;
  if (totalPurchasedPaisa === null || totalPaidPaisa === null) return null;

  const balanceDuePaisa = totalPurchasedPaisa - totalPaidPaisa;
  return {
    totalPurchasedPaisa,
    totalPaidPaisa,
    balanceDuePaisa,
    weOwe: balanceDuePaisa > 0,
    inCredit: balanceDuePaisa < 0,
    settled: balanceDuePaisa === 0,
  };
}
