import { describe, it, expect } from 'vitest';
import {
  packPriceToUnitPrice, unitPriceToPackPrice, isPackWord, hasPack,
  describePack, BASE_UNITS, PACK_NAMES,
} from '@/lib/units';

describe('packPriceToUnitPrice', () => {
  it('splits a pack price that divides evenly', () => {
    // Rs. 9,000 a box of 20 litres -> Rs. 450 a litre
    const r = packPriceToUnitPrice(900_000, 20);
    expect(r.unitPaisa).toBe(45_000);
    expect(r.roundedPackPaisa).toBe(900_000);
    expect(r.exact).toBe(true);
  });

  it('reports the shortfall when it does not divide evenly', () => {
    // Rs. 1,000 across 3 -> Rs. 333.33 each, Rs. 999.99 a pack
    const r = packPriceToUnitPrice(100_000, 3);
    expect(r.unitPaisa).toBe(33_333);
    expect(r.roundedPackPaisa).toBe(99_999);
    expect(r.exact).toBe(false);
  });

  it('never returns a fractional paisa', () => {
    for (const size of [3, 7, 12, 24, 13, 97]) {
      for (const paisa of [1, 100, 12_345, 999_999]) {
        expect(Number.isInteger(packPriceToUnitPrice(paisa, size).unitPaisa)).toBe(true);
      }
    }
  });

  it('treats a pack of 1 as the unit price itself', () => {
    expect(packPriceToUnitPrice(45_000, 1).unitPaisa).toBe(45_000);
  });

  it('guards against a zero or negative pack size', () => {
    expect(packPriceToUnitPrice(45_000, 0).unitPaisa).toBe(45_000);
    expect(packPriceToUnitPrice(45_000, -5).unitPaisa).toBe(45_000);
  });

  it('round-trips an evenly divisible price', () => {
    const unit = packPriceToUnitPrice(900_000, 24).unitPaisa;
    expect(unitPriceToPackPrice(unit, 24)).toBe(900_000);
  });
});

describe('isPackWord', () => {
  it('recognises container words regardless of case or padding', () => {
    expect(isPackWord('Box')).toBe(true);
    expect(isPackWord('  carton ')).toBe(true);
    expect(isPackWord('DOZEN')).toBe(true);
  });

  it('does not treat a unit of measure as a pack', () => {
    expect(isPackWord('Litre')).toBe(false);
    expect(isPackWord('KG')).toBe(false);
  });

  it('keeps the two catalogues disjoint', () => {
    for (const u of BASE_UNITS) expect(isPackWord(u)).toBe(false);
    for (const p of PACK_NAMES) expect(isPackWord(p)).toBe(true);
  });
});

describe('hasPack', () => {
  it('is false for no pack, null, or a pack of one', () => {
    expect(hasPack(1)).toBe(false);
    expect(hasPack(null)).toBe(false);
    expect(hasPack(undefined)).toBe(false);
  });
  it('is true from two upwards', () => {
    expect(hasPack(2)).toBe(true);
    expect(hasPack(24)).toBe(true);
  });
});

describe('describePack', () => {
  it('states the relationship the owner is confirming', () => {
    expect(describePack('Carton', 24, 'Piece')).toBe('1 Carton = 24 Piece');
  });
  it('says nothing when there is no real pack', () => {
    expect(describePack('Box', 1, 'Piece')).toBeNull();
    expect(describePack('', 12, 'Piece')).toBeNull();
    expect(describePack(null, 12, 'Piece')).toBeNull();
  });
});
