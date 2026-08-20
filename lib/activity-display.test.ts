import { describe, it, expect } from 'vitest';
import { relativeTime, userColor, activityHref, sinceFromDays } from '@/lib/activity-display';

const NOW = new Date('2026-08-20T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it('reads minutes, then hours', () => {
    expect(relativeTime(ago(30_000), NOW)).toBe('just now');
    expect(relativeTime(ago(60_000), NOW)).toBe('1 minute ago');
    expect(relativeTime(ago(15 * 60_000), NOW)).toBe('15 minutes ago');
    expect(relativeTime(ago(60 * 60_000), NOW)).toBe('1 hour ago');
    expect(relativeTime(ago(3 * 60 * 60_000), NOW)).toBe('3 hours ago');
  });

  it('prefers an exact hour count inside the first day', () => {
    // 13 hours back is late yesterday evening, but "13 hours ago" tells the
    // reader more than "Yesterday" does, so hours win until the day is out.
    expect(relativeTime(ago(13 * 60 * 60_000), NOW)).toBe('13 hours ago');
  });

  it('says Yesterday once a full day has passed', () => {
    expect(relativeTime(ago(26 * 60 * 60_000), NOW)).toBe('Yesterday');
    expect(relativeTime(ago(3 * 86_400_000), NOW)).toBe('3 days ago');
  });

  it('falls back to a date once it is a week old', () => {
    expect(relativeTime(ago(10 * 86_400_000), NOW)).toBe('10 Aug 2026');
  });
});

describe('userColor', () => {
  it('is stable for the same id', () => {
    expect(userColor('abc-123')).toBe(userColor('abc-123'));
  });

  it('returns a tailwind background class', () => {
    expect(userColor('someone')).toMatch(/^bg-[a-z]+-500$/);
  });

  it('spreads several ids over more than one colour', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(new Set(ids.map(userColor)).size).toBeGreaterThan(1);
  });
});

describe('activityHref', () => {
  it('links entities that have a page', () => {
    expect(activityHref('invoice', 'i1')).toBe('/invoices/i1');
    expect(activityHref('customer', 'c1')).toBe('/customers/c1');
    expect(activityHref('user', 'u1')).toBe('/settings/users/u1');
  });

  it('returns null when there is nothing to open', () => {
    expect(activityHref('expense', 'e1')).toBeNull();
    expect(activityHref('invoice', null)).toBeNull();
  });
});

describe('sinceFromDays', () => {
  it('is undefined for all-time', () => {
    expect(sinceFromDays('', NOW)).toBeUndefined();
  });

  it('counts back the given days', () => {
    expect(sinceFromDays('7', NOW)).toBe(new Date('2026-08-13T12:00:00Z').toISOString());
  });

  it('ignores nonsense', () => {
    expect(sinceFromDays('abc', NOW)).toBeUndefined();
    expect(sinceFromDays('-3', NOW)).toBeUndefined();
  });
});
