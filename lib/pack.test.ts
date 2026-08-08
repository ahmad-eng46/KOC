import { describe, it, expect } from 'vitest';
import {
  hasPack, toUnits, fromUnits, splitPacks, formatStock,
  packPreview, packOptionLabel, conversionHint, plural,
} from './pack';

const OIL = { pack_size: 12, pack_name: 'Box', unit: 'can' };
const FILTER = { pack_size: 20, pack_name: 'Packet', unit: 'pcs' };
const LOOSE = { pack_size: 1, pack_name: null, unit: 'unit' };

describe('hasPack', () => {
  it('needs both a size above 1 and a name', () => {
    expect(hasPack(OIL)).toBe(true);
    expect(hasPack(LOOSE)).toBe(false);
    expect(hasPack({ pack_size: 12, pack_name: null })).toBe(false);
    expect(hasPack({ pack_size: 12, pack_name: '  ' })).toBe(false);
    expect(hasPack({ pack_size: 1, pack_name: 'Box' })).toBe(false);
  });
});

describe('toUnits', () => {
  it('multiplies pack entries by the pack size', () => {
    expect(toUnits(20, 'pack', 12)).toBe(240); // 20 boxes of 12
    expect(toUnits(10, 'pack', 20)).toBe(200); // 10 packets of 20
    expect(toUnits(5, 'pack', 6)).toBe(30); // 5 cartons of 6
  });

  it('leaves unit entries alone', () => {
    expect(toUnits(5, 'unit', 12)).toBe(5);
    expect(toUnits(4, 'unit', 12)).toBe(4);
  });

  it('treats a product with no pack as pass-through', () => {
    expect(toUnits(7, 'pack', 1)).toBe(7);
  });

  it('handles fractional packs without float dust', () => {
    expect(toUnits(1.5, 'pack', 12)).toBe(18);
    expect(toUnits(0.1, 'pack', 3)).toBe(0.3); // 0.1*3 = 0.30000000000000004 raw
  });

  it('round-trips through fromUnits', () => {
    expect(fromUnits(toUnits(20, 'pack', 12), 'pack', 12)).toBe(20);
    expect(fromUnits(toUnits(5, 'unit', 12), 'unit', 12)).toBe(5);
  });
});

describe('splitPacks', () => {
  it('splits into whole packs and loose units', () => {
    expect(splitPacks(240, 12)).toEqual({ packs: 20, loose: 0 });
    expect(splitPacks(250, 12)).toEqual({ packs: 20, loose: 10 });
    expect(splitPacks(11, 12)).toEqual({ packs: 0, loose: 11 });
  });

  it('reports no packs when the product has none', () => {
    expect(splitPacks(138, 1)).toEqual({ packs: 0, loose: 138 });
  });
});

describe('formatStock', () => {
  it('shows units and whole packs', () => {
    expect(formatStock(240, OIL)).toBe('240 cans (20 Boxes)');
    expect(formatStock(200, FILTER)).toBe('200 pcs (10 Packets)');
  });

  it('calls out the loose remainder', () => {
    expect(formatStock(250, OIL)).toBe('250 cans (20 Boxes + 10 loose)');
  });

  it('drops the pack part below one full pack', () => {
    expect(formatStock(5, OIL)).toBe('5 cans');
  });

  it('shows plain units for a product with no pack', () => {
    expect(formatStock(138, LOOSE)).toBe('138 units');
  });

  it('does not dress up zero or negative stock as packs', () => {
    expect(formatStock(0, OIL)).toBe('0 cans');
    expect(formatStock(-3, OIL)).toBe('-3 cans');
  });

  it('keeps singulars singular', () => {
    expect(formatStock(1, OIL)).toBe('1 can');
    expect(formatStock(12, OIL)).toBe('12 cans (1 Box)');
  });
});

describe('labels and hints', () => {
  it('previews the pack definition', () => {
    expect(packPreview(OIL)).toBe('1 Box = 12 cans');
    expect(packPreview(FILTER)).toBe('1 Packet = 20 pcs');
    expect(packPreview(LOOSE)).toBeNull();
  });

  it('labels the dropdown option', () => {
    expect(packOptionLabel(OIL)).toBe('Box (12 cans)');
  });

  it('hints the conversion only when one is happening', () => {
    expect(conversionHint(2, 'pack', OIL)).toBe('= 24 cans');
    expect(conversionHint(5, 'unit', OIL)).toBeNull();
    expect(conversionHint(0, 'pack', OIL)).toBeNull();
    expect(conversionHint(2, 'pack', LOOSE)).toBeNull();
  });
});

describe('plural', () => {
  it('leaves words that already end in s', () => {
    expect(plural('pcs', 5)).toBe('pcs');
  });

  it('adds es after a sibilant', () => {
    expect(plural('Box', 2)).toBe('Boxes');
  });

  it('leaves singulars alone', () => {
    expect(plural('Box', 1)).toBe('Box');
    expect(plural('can', 1)).toBe('can');
  });

  it('preserves the owner-typed casing', () => {
    expect(plural('Carton', 3)).toBe('Cartons');
    expect(plural('Litre', 2)).toBe('Litres');
  });
});
