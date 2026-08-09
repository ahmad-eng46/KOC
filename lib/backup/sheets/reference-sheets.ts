import type ExcelJS from 'exceljs';
import type { AuditRow, BackupDataset, BrandRow, LocationRow } from '@/lib/backup/dataset';
import { addSheet } from '@/lib/backup/sheet-writer';
import { TAB, paintBalance, paintStatus } from '@/lib/backup/xlsx-style';
import { DASH, titleCase } from '@/lib/backup/sheets/labels';

/** Small lookup sheets, plus the two admin trails. */

export function addLocationsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const stat = (l: LocationRow) => {
    const customers = d.customers.filter((c) => c.location_id === l.id);
    const balances = customers.map((c) => d.customerStats.get(c.id)?.balance ?? 0);
    return {
      count: customers.length,
      // Only what can actually be collected: a net sum would let one overpaid
      // shop mask everyone else's dues, which is how the location report reads.
      outstanding: balances.reduce((a, b) => a + Math.max(b, 0), 0),
      sales: customers.reduce((a, c) => a + (d.customerStats.get(c.id)?.sales ?? 0), 0),
    };
  };
  const rows = [...d.locations].sort((a, b) => stat(b).outstanding - stat(a).outstanding);

  addSheet(wb, {
    name: 'Locations',
    tab: TAB.reference,
    rows,
    totals: true,
    emptyNote: 'No locations yet.',
    columns: [
      { header: '#', kind: 'int', value: (_l, i) => i + 1, width: 6 },
      { header: 'Location', value: (l) => l.name },
      { header: 'Code', value: (l) => l.short_code ?? DASH },
      { header: 'Customers', kind: 'int', total: true, value: (l) => stat(l).count },
      {
        header: 'Total Outstanding',
        kind: 'money',
        total: true,
        value: (l) => stat(l).outstanding,
        paint: (cell, l) => paintBalance(cell, stat(l).outstanding),
      },
      { header: 'Total Sales', kind: 'money', total: true, value: (l) => stat(l).sales },
    ],
  });
}

export function addBrandsSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const productCount = (b: BrandRow) => d.products.filter((p) => p.brand_id === b.id).length;
  const rows = [...d.brands].sort((a, b) => a.name.localeCompare(b.name));

  addSheet(wb, {
    name: 'Brands',
    tab: TAB.reference,
    rows,
    emptyNote: 'No brands yet.',
    columns: [
      { header: '#', kind: 'int', value: (_b, i) => i + 1, width: 6 },
      { header: 'Brand', value: (b) => b.name },
      { header: 'Type', value: (b) => titleCase(b.brand_type) },
      { header: 'Products', kind: 'int', value: productCount },
      { header: 'Contact', value: (b) => b.contact_person ?? DASH },
      { header: 'Phone', value: (b) => b.phone ?? DASH },
    ],
  });
}

export function addUsersSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  const rows = [...d.users].sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));

  addSheet(wb, {
    name: 'Users',
    tab: TAB.reference,
    rows,
    emptyNote: 'No users linked to this business.',
    columns: [
      { header: '#', kind: 'int', value: (_u, i) => i + 1, width: 6 },
      { header: 'Name', value: (u) => u.full_name ?? DASH },
      { header: 'Email', value: (u) => u.email },
      { header: 'Role', value: (u) => titleCase(u.role) },
      {
        header: 'Status',
        value: (u) => (u.is_active ? 'Active' : 'Disabled'),
        paint: (cell, u) => paintStatus(cell, u.is_active ? 'good' : 'bad'),
      },
      { header: 'Last Login (PKT)', kind: 'datetime', value: (u) => u.last_login_at },
    ],
  });
}

export function addAuditSheet(wb: ExcelJS.Workbook, d: BackupDataset): void {
  addSheet(wb, {
    name: 'Audit Log',
    tab: TAB.reference,
    rows: d.auditLog,
    emptyNote: 'No audit entries.',
    columns: [
      { header: 'Date (PKT)', kind: 'datetime', value: (a) => a.at },
      { header: 'User', value: (a) => (a.user_id ? d.userName.get(a.user_id) ?? 'System' : 'System') },
      { header: 'Table', value: (a) => titleCase(a.table_name) },
      { header: 'Action', value: (a) => titleCase(a.action.toLowerCase()) },
      { header: 'Changes', value: describeChanges, width: 46 },
      { header: 'Record ID', kind: 'id', value: (a) => a.row_id, width: 38 },
    ],
  });
}

const MAX_LISTED_CHANGES = 6;
const MAX_VALUE_CHARS = 40;

/** "total_paisa: 5000 → 6000" rather than two walls of JSON. */
function describeChanges(entry: AuditRow): string {
  const before = asRecord(entry.before_jsonb);
  const after = asRecord(entry.after_jsonb);

  if (entry.action === 'INSERT') return summarise(after);
  if (entry.action === 'DELETE') return summarise(before);

  const changed: string[] = [];
  for (const key of Object.keys(after)) {
    if (key === 'updated_at') continue;
    const from = short(before[key]);
    const to = short(after[key]);
    if (from !== to) changed.push(`${key}: ${from} → ${to}`);
  }
  if (changed.length === 0) return DASH;
  return trim(changed);
}

function summarise(row: Record<string, unknown>): string {
  const keys = Object.keys(row).filter((k) => !k.endsWith('_at') && k !== 'id');
  return trim(keys.map((k) => `${k}: ${short(row[k])}`));
}

function trim(parts: string[]): string {
  if (parts.length <= MAX_LISTED_CHANGES) return parts.join('; ');
  return `${parts.slice(0, MAX_LISTED_CHANGES).join('; ')}; +${parts.length - MAX_LISTED_CHANGES} more`;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function short(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}
