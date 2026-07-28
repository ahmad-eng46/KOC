import { describe, expect, it } from 'vitest';
import { sortOilFirst } from '@/lib/business';
import type { Business } from '@/lib/business-shared';

function biz(name: string, type: Business['type']): Business {
  return { id: name.toLowerCase().replace(/\s+/g, '-'), name, type, is_active: true };
}

// Real set, in the alphabetical order the query returns them.
const ALL = [
  biz('Khaliq Cigarettes', 'cigarettes'),
  biz('Khaliq Oil', 'oil'),
  biz('Khaliq Zameen', 'zameen'),
  biz('Other Trading', 'other'),
];

describe('sortOilFirst', () => {
  it('1. puts the oil business first', () => {
    expect(sortOilFirst(ALL)[0].name).toBe('Khaliq Oil');
  });

  it('2. keeps the rest alphabetical', () => {
    expect(sortOilFirst(ALL).map((b) => b.name)).toEqual([
      'Khaliq Oil',
      'Khaliq Cigarettes',
      'Khaliq Zameen',
      'Other Trading',
    ]);
  });

  it('3. does not mutate the input', () => {
    const input = [...ALL];
    sortOilFirst(input);
    expect(input[0].name).toBe('Khaliq Cigarettes');
  });

  it('4. falls back to alphabetical when there is no oil business', () => {
    const noOil = ALL.filter((b) => b.type !== 'oil');
    expect(sortOilFirst(noOil).map((b) => b.name)).toEqual([
      'Khaliq Cigarettes',
      'Khaliq Zameen',
      'Other Trading',
    ]);
  });

  it('5. is keyed on type, not name — a renamed oil business still leads', () => {
    const renamed = [biz('Zzz Petroleum Ltd', 'oil'), biz('Aaa Trading', 'other')];
    expect(sortOilFirst(renamed)[0].name).toBe('Zzz Petroleum Ltd');
  });

  it('6. empty list stays empty', () => {
    expect(sortOilFirst([])).toEqual([]);
  });
});
