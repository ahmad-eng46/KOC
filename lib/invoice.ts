import type { DiscountType } from '@/lib/validators/invoice';

export type InvoiceTotals = {
  subtotal_paisa: number;
  discount_paisa: number;
  total_paisa: number;
  line_totals_paisa: number[];
};

/**
 * Pure recompute of invoice totals from line items.
 *
 * Rules:
 *  - Each line gross  = round(quantity * unit_price_paisa)  (paisa, integer)
 *  - Each line total  = max(0, gross - line.discount_paisa)
 *  - Subtotal         = sum of line totals
 *  - Invoice discount:
 *      'none'    → 0
 *      'fixed'   → round(discountValue) paisa, clamped to [0, subtotal]
 *      'percent' → round(subtotal * clamp(discountValue, 0..100) / 100)
 *  - Total            = max(0, subtotal - discount)
 *
 * Math.round is half-up for positive values (JS standard).
 */
export function computeInvoiceTotals(
  items: ReadonlyArray<{
    quantity: number;
    unit_price_paisa: number;
    discount_paisa?: number;
  }>,
  discountType: DiscountType,
  discountValue: number,
): InvoiceTotals {
  const lineTotals = items.map((item) => {
    const gross = Math.round(item.quantity * item.unit_price_paisa);
    const lineDiscount = item.discount_paisa ?? 0;
    return Math.max(0, gross - lineDiscount);
  });
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);

  let discount = 0;
  if (discountType === 'fixed') {
    discount = Math.max(0, Math.round(discountValue));
  } else if (discountType === 'percent') {
    const pct = Math.max(0, Math.min(100, discountValue));
    discount = Math.round((subtotal * pct) / 100);
  }
  discount = Math.min(discount, subtotal);

  const total = Math.max(0, subtotal - discount);

  return {
    subtotal_paisa: subtotal,
    discount_paisa: discount,
    total_paisa: total,
    line_totals_paisa: lineTotals,
  };
}
