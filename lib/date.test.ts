import { describe, expect, it } from 'vitest';
import { toKarachiExcelDate } from '@/lib/date';

// Karachi is UTC+5 year-round — Pakistan has observed no DST since 2009.
describe('toKarachiExcelDate', () => {
  it('1. shifts a UTC instant forward by 5 hours', () => {
    const out = toKarachiExcelDate('2026-05-09T10:15:04.239Z');
    expect(out.toISOString()).toBe('2026-05-09T15:15:04.000Z');
  });

  it('2. accepts a Date as well as a string', () => {
    const out = toKarachiExcelDate(new Date('2026-05-09T10:15:04.239Z'));
    expect(out.toISOString()).toBe('2026-05-09T15:15:04.000Z');
  });

  it('3. rolls over the date when Karachi is already tomorrow', () => {
    // 21:30 UTC is 02:30 the next day in Karachi
    const out = toKarachiExcelDate('2026-07-28T21:30:00Z');
    expect(out.toISOString()).toBe('2026-07-29T02:30:00.000Z');
  });

  it('4. midnight UTC becomes 05:00 the same day', () => {
    const out = toKarachiExcelDate('2026-07-28T00:00:00Z');
    expect(out.toISOString()).toBe('2026-07-28T05:00:00.000Z');
  });

  it('5. drops sub-second precision, which Excel does not display', () => {
    const out = toKarachiExcelDate('2026-07-28T00:00:00.987Z');
    expect(out.getUTCMilliseconds()).toBe(0);
  });

  it('6. holds across a northern-summer date, since Pakistan has no DST', () => {
    const winter = toKarachiExcelDate('2026-01-15T12:00:00Z');
    const summer = toKarachiExcelDate('2026-07-15T12:00:00Z');
    expect(winter.getUTCHours()).toBe(17);
    expect(summer.getUTCHours()).toBe(17);
  });
});
