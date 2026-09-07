import type { Money } from '@/lib/money';

/**
 * Base units measure a single sellable item. A carton is not one of them —
 * it is a container that holds some number of these, which is what
 * PACK_NAMES is for. Offering "Box" and "Carton" in both lists is what let a
 * product be saved as "1 Box contains 12 Box", so the two lists are disjoint
 * and `isPackWord` guards the boundary.
 */
export const BASE_UNITS = [
  'Piece', 'Litre', 'ML', 'KG', 'Gram', 'Metre', 'Foot', 'Pair', 'Set',
] as const;

/** Containers. Each holds `pack_size` base units. */
export const PACK_NAMES = [
  'Box', 'Carton', 'Packet', 'Case', 'Bundle', 'Crate', 'Drum', 'Bag', 'Tin', 'Dozen',
] as const;

/** Packs that carry a conventional count, offered as the default when picked. */
export const PACK_DEFAULT_SIZE: Record<string, number> = {
  Dozen: 12,
  Carton: 24,
  Box: 12,
};

const PACK_LOOKUP = new Set(PACK_NAMES.map((n) => n.toLowerCase()));

/** True when a word names a container rather than a unit of measure. */
export function isPackWord(value: string): boolean {
  return PACK_LOOKUP.has(value.trim().toLowerCase());
}

/** A pack of 1 is not a pack. Keeps every caller's meaning of "has a pack" identical. */
export function hasPack(packSize: number | null | undefined): boolean {
  return (packSize ?? 1) > 1;
}

export type PackConversion = {
  /** Per-unit price to store. Always an integer paisa. */
  unitPaisa: Money;
  /** What `unitPaisa * packSize` actually comes to. */
  roundedPackPaisa: Money;
  /** False when the pack price does not divide evenly into whole paisa. */
  exact: boolean;
};

/**
 * Split a pack price across its units.
 *
 * Prices are stored per unit (0050) and every invoice, COGS figure and report
 * multiplies up from there, so a pack price that does not divide evenly cannot
 * be stored faithfully. Rather than hide the difference, the rounded per-unit
 * price and the pack total it implies are both returned, and the form shows
 * them. Rs. 1,000 across 3 units is Rs. 333.33 each and Rs. 999.99 a pack; the
 * owner sees that before saving instead of finding it in a total later.
 */
export function packPriceToUnitPrice(packPaisa: Money, packSize: number): PackConversion {
  const size = Math.max(1, Math.trunc(packSize));
  const unitPaisa = Math.round(packPaisa / size);
  const roundedPackPaisa = unitPaisa * size;
  return { unitPaisa, roundedPackPaisa, exact: roundedPackPaisa === packPaisa };
}

/** The pack price implied by a per-unit price. Exact by construction. */
export function unitPriceToPackPrice(unitPaisa: Money, packSize: number): Money {
  return unitPaisa * Math.max(1, Math.trunc(packSize));
}

/**
 * "1 Carton = 24 Piece". The sentence the owner reads to confirm the product
 * is set up the way they meant.
 */
export function describePack(
  packName: string | null | undefined,
  packSize: number | null | undefined,
  unit: string,
): string | null {
  const name = packName?.trim();
  if (!name || !hasPack(packSize)) return null;
  return `1 ${name} = ${packSize} ${unit}`;
}
