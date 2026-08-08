/**
 * Bulk packaging: a product is stocked and priced in its smallest unit (can,
 * piece, bottle) but bought and sold by the pack (box, packet, carton).
 *
 * The database only ever holds the smallest unit. Every quantity in
 * stock_movements, invoice_items, return_items and stock_purchases is units,
 * exactly as before packs existed, and every price is per unit. Conversion
 * happens here, before anything is sent to an RPC — so the RPCs, the stock
 * guard, COGS and the P&L are untouched by this feature.
 *
 * A product with pack_size 1 or no pack_name has no pack, and every function
 * here degrades to the pre-pack behaviour.
 */

/** What the number a user typed is counted in. */
export type EntryMode = 'unit' | 'pack';

export type PackInfo = {
  /** Individual units in one pack; 1 means "no pack". */
  pack_size: number;
  /** What the pack is called — "Box". Null when the product has no pack. */
  pack_name: string | null;
  /** The smallest sellable unit — "can". */
  unit: string;
};

/** Quantities are NUMERIC(12,3); anything finer is noise from float maths. */
const SCALE = 1000;

function round3(n: number): number {
  return Math.round(n * SCALE) / SCALE;
}

/**
 * Conservative plural: never touch a word that already ends in "s" ("pcs"),
 * add "es" after a sibilant ("Box" → "Boxes"), otherwise "s". Pack and unit
 * names are typed by the owner, so casing is left alone.
 */
export function plural(word: string, count: number): string {
  const w = word.trim();
  if (!w || Math.abs(count) === 1) return w;
  if (/s$/i.test(w)) return w;
  if (/(x|z|ch|sh)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}

export function hasPack(p: Pick<PackInfo, 'pack_size' | 'pack_name'>): boolean {
  return p.pack_size > 1 && !!p.pack_name && p.pack_name.trim().length > 0;
}

/** Whatever the user typed, in stock units. */
export function toUnits(quantity: number, mode: EntryMode, packSize: number): number {
  if (!Number.isFinite(quantity)) return quantity;
  if (mode !== 'pack') return quantity;
  return round3(quantity * Math.max(packSize, 1));
}

/** Stock units back to the entry the user made — the inverse of toUnits. */
export function fromUnits(units: number, mode: EntryMode, packSize: number): number {
  if (!Number.isFinite(units)) return units;
  if (mode !== 'pack') return units;
  const size = Math.max(packSize, 1);
  return round3(units / size);
}

/** Whole packs plus the units left over. */
export function splitPacks(units: number, packSize: number): { packs: number; loose: number } {
  const size = Math.max(packSize, 1);
  if (size === 1) return { packs: 0, loose: round3(units) };
  const rounded = round3(units);
  const packs = Math.floor(rounded / size);
  return { packs, loose: round3(rounded - packs * size) };
}

/**
 * "240 cans (20 Boxes)", "250 cans (20 Boxes + 10 loose)", "138 units".
 * Negative or zero stock is shown plainly — "-3 cans" reads better than
 * pretending it is some number of boxes.
 */
export function formatStock(units: number, p: PackInfo): string {
  const qty = round3(units);
  const base = `${qty} ${plural(p.unit, qty)}`;
  if (!hasPack(p) || qty <= 0) return base;

  const { packs, loose } = splitPacks(qty, p.pack_size);
  if (packs === 0) return base;

  const packPart = `${packs} ${plural(p.pack_name!, packs)}`;
  return loose > 0 ? `${base} (${packPart} + ${loose} loose)` : `${base} (${packPart})`;
}

/** "1 Box = 12 cans" — the live preview under the pack fields. */
export function packPreview(p: PackInfo): string | null {
  if (!hasPack(p)) return null;
  return `1 ${p.pack_name!.trim()} = ${p.pack_size} ${plural(p.unit, p.pack_size)}`;
}

/** "Box (12 cans)" — the pack option in a quantity dropdown. */
export function packOptionLabel(p: PackInfo): string {
  return `${p.pack_name!.trim()} (${p.pack_size} ${plural(p.unit, p.pack_size)})`;
}

/** "Can (single)" — the unit option in a quantity dropdown. */
export function unitOptionLabel(p: Pick<PackInfo, 'unit'>): string {
  return `${p.unit} (single)`;
}

/**
 * "= 24 cans" under a quantity input, shown only when the entry needs
 * converting — in unit mode the number already is the answer.
 */
export function conversionHint(
  quantity: number,
  mode: EntryMode,
  p: PackInfo,
): string | null {
  if (mode !== 'pack' || !hasPack(p) || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const units = toUnits(quantity, mode, p.pack_size);
  return `= ${units} ${plural(p.unit, units)}`;
}

/**
 * How a recorded line reads back: "2 Box" with "24 cans" underneath when it
 * was entered by the pack, plain units otherwise.
 *
 * Rows written before packs existed have a null entry_mode, which is exactly
 * "entered in units" — so they render as they always did. The size comes from
 * the snapshot taken at the time, the name from the product today: the number
 * must not drift when the pack is resized, the wording may.
 */
export function formatEnteredQuantity(item: {
  /** Always stock units. */
  quantity: number;
  unit: string;
  entered_quantity?: number | null;
  entry_mode?: EntryMode | null;
  pack_name?: string | null;
}): { primary: string; secondary: string | null } {
  const units = round3(item.quantity);
  const plain = { primary: `${units} ${plural(item.unit, units)}`, secondary: null };

  if (item.entry_mode !== 'pack') return plain;
  const entered = item.entered_quantity;
  const name = item.pack_name?.trim();
  if (entered == null || !name) return plain;

  return {
    primary: `${round3(entered)} ${plural(name, entered)}`,
    secondary: `${units} ${plural(item.unit, units)}`,
  };
}
