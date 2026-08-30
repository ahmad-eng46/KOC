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

/**
 * A per-line rate typed by a user, in rupees, turned into paisa.
 *
 * Parsed off the digit string rather than through parseFloat: `19.99 * 100` is
 * 1998.9999999999998 in IEEE-754, and while Math.round happens to rescue that
 * one, the codebase's rule is that money never travels through a float at all
 * (iron rule #1). Splitting on the decimal point and padding the fraction is
 * exact for every input this accepts.
 *
 * Rejects rather than silently coercing. A rate box that turns "abc" into 0.00
 * writes a free product into the books and tells nobody.
 */
export type RateParse =
  | { ok: true; paisa: number }
  | { ok: false; error: string };

/** Rs. 10,000,000 a unit. Past this it is a typo, not a price. */
const MAX_RATE_PAISA = 1_000_000_000;

export function parseRateInput(raw: string): RateParse {
  const text = raw.trim().replace(/,/g, '');

  if (text === '') return { ok: false, error: 'Enter a rate' };
  if (text.startsWith('-')) return { ok: false, error: 'Rate cannot be negative' };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) {
    return { ok: false, error: 'Rate must be a number' };
  }

  const [, whole, fraction = ''] = match;
  if (fraction.length > 2) {
    return { ok: false, error: 'Rate cannot be finer than 1 paisa (2 decimals)' };
  }

  const paisa = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(paisa)) return { ok: false, error: 'Rate is too large' };
  if (paisa > MAX_RATE_PAISA) return { ok: false, error: 'Rate is too large' };

  return { ok: true, paisa };
}

/** The rate box's starting text for a product, in the same shape a user types. */
export function formatRateInput(paisa: number): string {
  return (Math.round(paisa) / 100).toFixed(2);
}
