export type StockShortage = {
  product_id: string;
  product_name: string;
  on_hand: number;
  requested: number;
};

/**
 * Sum requested quantity per product, so the same product appearing on
 * several lines of one invoice is checked against stock as a single draw.
 */
export function sumRequestedByProduct(
  items: ReadonlyArray<{ product_id: string; quantity: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + item.quantity);
  }
  return totals;
}

/**
 * Products whose requested quantity exceeds what is on hand.
 *
 * A product absent from stockOnHand has never had a movement recorded, so it
 * counts as zero. Stock that is already negative stays negative — any draw
 * against it is a shortage.
 */
export function findStockShortages(
  items: ReadonlyArray<{ product_id: string; quantity: number }>,
  stockOnHand: ReadonlyMap<string, number>,
  productNames: ReadonlyMap<string, string>,
): StockShortage[] {
  const shortages: StockShortage[] = [];
  for (const [product_id, requested] of sumRequestedByProduct(items)) {
    const on_hand = stockOnHand.get(product_id) ?? 0;
    if (requested > on_hand) {
      shortages.push({
        product_id,
        product_name: productNames.get(product_id) ?? product_id,
        on_hand,
        requested,
      });
    }
  }
  return shortages;
}

export function formatShortageError(shortages: ReadonlyArray<StockShortage>): string {
  const lines = shortages.map(
    (s) => `${s.product_name}: ${s.on_hand} in stock, ${s.requested} requested`,
  );
  return `Not enough stock. ${lines.join('; ')}.`;
}
