import { plural } from '@/lib/pack';
import type { ProductRow } from '@/lib/backup/dataset';

/** Human wording shared by the data sheets. No sheet prints a raw enum. */

export const DASH = '—';

export function titleCase(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** "Box of 12" — or a dash when the product is sold loose. */
export function packLabel(p: Pick<ProductRow, 'pack_size' | 'pack_name' | 'unit'>): string {
  if (p.pack_size <= 1 || !p.pack_name?.trim()) return DASH;
  return `${p.pack_name.trim()} of ${p.pack_size} ${plural(p.unit, p.pack_size)}`;
}

export type Tone = 'good' | 'bad' | 'warn' | 'none';

export type Status = { text: string; tone: Tone };

export function stockStatus(qty: number, threshold: number, isActive: boolean): Status {
  if (qty <= 0) return { text: 'Out of Stock', tone: 'bad' };
  if (threshold > 0 && qty <= threshold) return { text: 'Low Stock', tone: 'warn' };
  if (!isActive) return { text: 'Inactive', tone: 'none' };
  return { text: 'In Stock', tone: 'good' };
}

/**
 * Read from the money, not from the status column: an invoice can be left at
 * 'issued' while payments come in, and the owner cares which invoices still
 * have cash outstanding.
 */
export function invoiceStatus(status: string, balancePaisa: number, paidPaisa: number): Status {
  if (status === 'cancelled') return { text: 'Cancelled', tone: 'bad' };
  if (status === 'draft') return { text: 'Draft', tone: 'none' };
  if (balancePaisa <= 0) return { text: 'Paid', tone: 'good' };
  if (paidPaisa > 0) return { text: 'Partially Paid', tone: 'warn' };
  return { text: 'Unpaid', tone: 'bad' };
}

export function customerStatus(balancePaisa: number, isDefaulter: boolean): Status {
  if (isDefaulter) return { text: 'Defaulter', tone: 'bad' };
  if (balancePaisa > 0) return { text: 'Owes', tone: 'warn' };
  if (balancePaisa < 0) return { text: 'In Credit', tone: 'good' };
  return { text: 'Clear', tone: 'good' };
}

export function movementType(type: string): string {
  const map: Record<string, string> = {
    in: 'In', out: 'Out', return: 'Return', adjustment: 'Adjustment',
  };
  return map[type] ?? titleCase(type);
}

/** "3 items", "1 item", "—". */
export function itemCount(n: number): string {
  if (n <= 0) return DASH;
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/** "2 Boxes" when the line was keyed by the pack, otherwise a dash. */
export function asEntered(
  enteredQuantity: number | null,
  entryMode: string | null,
  packName: string | null,
): string {
  if (entryMode !== 'pack' || enteredQuantity == null || !packName?.trim()) return DASH;
  return `${enteredQuantity} ${plural(packName.trim(), enteredQuantity)}`;
}
