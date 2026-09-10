/**
 * Deciding whether a line's rate departed from what was suggested.
 *
 * Pure so it can be tested without a database. The server decides what the
 * suggestion was — never the browser, which would let a staff user hide an
 * override by claiming they were suggested the rate they typed (iron rule #7).
 */

/**
 * Below this, a difference is not worth an admin's attention.
 *
 * Pack prices are divided across their units, and that division does not
 * always land on a whole paisa — Rs. 1,000 across a bundle of 3 is Rs. 333.33
 * each and Rs. 999.99 a pack. Logging those would bury the real discounts
 * under rounding noise. One percent is far below any deliberate concession and
 * far above any rounding artefact.
 */
export const RATE_OVERRIDE_TOLERANCE_PERCENT = 1;

export type RateOverride = {
  productId: string;
  productName: string;
  suggestedPaisa: number;
  enteredPaisa: number;
  /** entered − suggested. Negative means sold cheaper than suggested. */
  differencePaisa: number;
  /** Signed, relative to the suggestion, rounded to two decimals. */
  differencePercent: number;
  /** True when the line sold below what the goods cost. */
  belowCost: boolean;
  costPaisa: number | null;
};

export type RateOverrideCandidate = {
  productId: string;
  productName: string;
  /** null when nothing could be suggested — then there is nothing to depart from. */
  suggestedPaisa: number | null;
  enteredPaisa: number;
  /** Snapshot of what the goods cost, or null when it is not known. */
  costPaisa: number | null;
};

/**
 * Which lines departed far enough from their suggestion to be worth recording.
 *
 * A line with no suggestion is never an override: there was no number to
 * differ from, so the rate the user typed is simply the price.
 */
export function findRateOverrides(
  lines: RateOverrideCandidate[],
  tolerancePercent: number = RATE_OVERRIDE_TOLERANCE_PERCENT,
): RateOverride[] {
  const out: RateOverride[] = [];

  for (const line of lines) {
    const { suggestedPaisa, enteredPaisa } = line;
    if (suggestedPaisa === null) continue;

    const differencePaisa = enteredPaisa - suggestedPaisa;
    if (differencePaisa === 0) continue;

    // A suggestion of zero has no meaningful percentage. Any departure from it
    // is total, so it always counts.
    const differencePercent = suggestedPaisa === 0
      ? 100
      : Math.round((differencePaisa / suggestedPaisa) * 10_000) / 100;

    if (Math.abs(differencePercent) < tolerancePercent) continue;

    out.push({
      productId: line.productId,
      productName: line.productName,
      suggestedPaisa,
      enteredPaisa,
      differencePaisa,
      differencePercent,
      costPaisa: line.costPaisa,
      belowCost: line.costPaisa != null && line.costPaisa > 0
        && enteredPaisa < line.costPaisa,
    });
  }

  return out;
}

/** One line of the admin-facing description. */
export function describeOverride(
  o: RateOverride,
  money: (paisa: number) => string,
): string {
  const direction = o.differencePaisa < 0 ? 'down' : 'up';
  const pct = Math.abs(o.differencePercent).toFixed(2).replace(/\.00$/, '');
  return (
    `${o.productName}: ${money(o.enteredPaisa)} instead of ${money(o.suggestedPaisa)}`
    + ` (${direction} ${pct}%)`
    + (o.belowCost ? ' — BELOW COST' : '')
  );
}
