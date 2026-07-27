import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay } from 'date-fns';

const KARACHI = 'Asia/Karachi';

export function nowKarachi(): Date {
  return toZonedTime(new Date(), KARACHI);
}

export function todayKarachiISO(): string {
  return formatInTimeZone(new Date(), KARACHI, 'yyyy-MM-dd');
}

export function formatKarachi(d: Date | string, fmt = 'dd MMM yyyy'): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return formatInTimeZone(date, KARACHI, fmt);
}

export function startOfDayKarachi(d: Date): Date {
  const zoned = toZonedTime(d, KARACHI);
  const start = startOfDay(zoned);
  return fromZonedTime(start, KARACHI);
}

export function endOfDayKarachi(d: Date): Date {
  const zoned = toZonedTime(d, KARACHI);
  const end = endOfDay(zoned);
  return fromZonedTime(end, KARACHI);
}

export function karachiToUtc(d: Date): Date {
  return fromZonedTime(d, KARACHI);
}
