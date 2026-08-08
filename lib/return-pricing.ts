import type { Money } from '@/lib/money';

/**
 * Discounts in this app are recorded at the INVOICE level — a flat amount off
 * the total — while `invoice_items.unit_price_paisa` keeps the full list
 * price. A refund based on the list price therefore over-credits the customer
 * by their share of the discount.
 *
 * These helpers spread the invoice discount across the lines in proportion to
 * what each line contributed, so a return can refund what was actually paid.
 *
 * `public.invoice_item_effective_prices()` (migration 0048) mirrors this
 * exactly — same proportion, same half-up rounding, same "remainder lands on
 * the last line", same ordering. Change one and you must change the other.
 * The server stays authoritative: the return form omits the price unless the
 * owner overrides it, so a divergence would misreport rather than mis-save.
 */

export type DiscountableLine = {
  id: string;
  /** May be fractional — quantity is NUMERIC(12,3). */
  quantity: number;
  /** qty × unit price, less any per-item discount: the line before the invoice discount. */
  lineTotalPaisa: Money;
};

export type EffectiveLinePrice = {
  id: string;
  /** This line's portion of the invoice discount. */
  discountSharePaisa: Money;
  /** lineTotal − share: what the customer actually paid for the line. */
  effectiveLineTotalPaisa: Money;
  /** effectiveLineTotal ÷ quantity, to the nearest paisa. */
  effectiveUnitPricePaisa: Money;
};

// BigInt() calls rather than 0n literals: tsconfig targets ES2017, and this is
// a type-check-only project (noEmit), so the literal syntax is unavailable.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** Half-up, matching Postgres ROUND() and Math.round() for positive values. */
function roundedDiv(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  return r * TWO >= denominator ? q + ONE : q;
}

function unitPrice(lineTotalPaisa: Money, quantity: number): Money {
  if (!(quantity > 0)) return 0;
  return Math.round(lineTotalPaisa / quantity);
}

/**
 * Every line's effective price once `invoiceDiscountPaisa` is spread across
 * them. Lines are returned in the order given; that order decides which line
 * absorbs the rounding remainder, so callers must pass a stable one.
 *
 * BigInt for the proportion because lineTotal × discount overflows the safe
 * integer range on large invoices. No discount, or nothing to discount, and
 * every line keeps its original price.
 */
export function distributeInvoiceDiscount(
  lines: DiscountableLine[],
  invoiceDiscountPaisa: Money,
): EffectiveLinePrice[] {
  if (lines.length === 0) return [];

  const base = lines.map((l) => Math.max(l.lineTotalPaisa, 0));
  const subtotal = base.reduce((sum, b) => sum + b, 0);
  // Never discount more than the invoice is worth.
  const discount = Math.min(Math.max(invoiceDiscountPaisa, 0), subtotal);

  if (discount === 0) {
    return lines.map((l) => ({
      id: l.id,
      discountSharePaisa: 0,
      effectiveLineTotalPaisa: l.lineTotalPaisa,
      effectiveUnitPricePaisa: unitPrice(l.lineTotalPaisa, l.quantity),
    }));
  }

  const subtotalBig = BigInt(subtotal);
  const discountBig = BigInt(discount);
  let allocated = ZERO;

  return lines.map((line, i) => {
    // The last line takes whatever is left, so the shares always sum to the
    // discount exactly rather than drifting by a paisa per line.
    const share =
      i === lines.length - 1
        ? discountBig - allocated
        : roundedDiv(BigInt(base[i]) * discountBig, subtotalBig);
    if (i < lines.length - 1) allocated += share;

    const effective = BigInt(line.lineTotalPaisa) - share;
    const clamped = effective < ZERO ? 0 : Number(effective);

    return {
      id: line.id,
      discountSharePaisa: Number(share),
      effectiveLineTotalPaisa: clamped,
      effectiveUnitPricePaisa: unitPrice(clamped, line.quantity),
    };
  });
}
