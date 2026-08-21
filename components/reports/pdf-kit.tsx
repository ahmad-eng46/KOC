// Shared building blocks for every PDF in the app, so a report declares what it
// contains rather than re-implementing a header, a footer and a totals row.
//
// Deliberately built on @react-pdf/renderer rather than headless Chromium: the
// app deploys to Vercel, where bundling Chromium means a heavier runtime and
// cold starts, and this layer already exists and is exercised by the report
// exports. See docs/pdf-export-audit.md §5.

import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatPKR } from '@/lib/money';

export const tokens = {
  ink: '#111827',
  muted: '#6B7280',
  faint: '#9CA3AF',
  rule: '#E5E7EB',
  band: '#F7F9FC',
  headBg: '#F0F0F0',
  good: '#15803D',
  bad: '#B91C1C',
  warn: '#B45309',
};

export const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 46, paddingHorizontal: 32, fontSize: 9.5, fontFamily: 'Helvetica', color: tokens.ink },

  // Header
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  company: { fontSize: 13, fontWeight: 700 },
  companyLine: { fontSize: 8, color: tokens.muted, marginTop: 1 },
  title: { fontSize: 15, fontWeight: 700, marginTop: 10 },
  subtitle: { fontSize: 9, color: tokens.muted, marginTop: 2 },
  rule: { borderBottomWidth: 1, borderBottomColor: tokens.ink, marginTop: 8, marginBottom: 10 },

  // Filters
  filterBox: { borderWidth: 0.5, borderColor: tokens.rule, backgroundColor: tokens.band, borderRadius: 3, padding: 6, marginBottom: 10 },
  filterHead: { fontSize: 7.5, fontWeight: 700, color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  filterLine: { flexDirection: 'row', flexWrap: 'wrap' },
  filterItem: { fontSize: 8, marginRight: 12, marginTop: 1 },
  filterLabel: { color: tokens.muted },

  // Summary
  h2: { fontSize: 11, fontWeight: 700, marginTop: 12, marginBottom: 5 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  stat: { borderWidth: 0.5, borderColor: tokens.rule, borderRadius: 3, paddingVertical: 5, paddingHorizontal: 7, minWidth: 104 },
  statLabel: { fontSize: 7, color: tokens.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  statValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  statHint: { fontSize: 7, color: tokens.muted, marginTop: 1 },

  // Table
  thRow: { flexDirection: 'row', backgroundColor: tokens.headBg, paddingVertical: 4, paddingHorizontal: 4 },
  th: { fontSize: 8, fontWeight: 700 },
  tdRow: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#EEE' },
  tdRowBand: { backgroundColor: '#FAFBFC' },
  td: { fontSize: 8.5 },
  /** Gutter between columns; without it a right-aligned value touches the next. */
  cell: { paddingRight: 6 },
  groupRow: { flexDirection: 'row', backgroundColor: '#EEF2F7', paddingVertical: 3.5, paddingHorizontal: 4, marginTop: 4 },
  groupText: { fontSize: 8.5, fontWeight: 700 },
  totalRow: { flexDirection: 'row', backgroundColor: '#E8EDF4', paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: tokens.ink, marginTop: 2 },
  totalText: { fontSize: 9, fontWeight: 700 },
  empty: { fontSize: 9, color: tokens.muted, textAlign: 'center', paddingVertical: 24 },

  // Footer
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7.5, color: tokens.faint },
});

// ───────────────────────────────────────────────
export type CompanyInfo = {
  name: string;
  address?: string | null;
  phone?: string | null;
  ntn?: string | null;
};

export type FilterEntry = { label: string; value: string };

/**
 * Repeated at the top of every page (`fixed`), so a page torn out of a stack
 * still says which business and which report it belongs to.
 */
export function ReportHeader({
  company, title, subtitle,
}: {
  company: CompanyInfo;
  title: string;
  subtitle?: string;
}) {
  const contact = [company.address, company.phone].filter(Boolean).join(' · ');

  return (
    <View fixed>
      <View style={s.headRow}>
        <View>
          <Text style={s.company}>{company.name}</Text>
          {contact ? <Text style={s.companyLine}>{contact}</Text> : null}
          {company.ntn ? <Text style={s.companyLine}>NTN: {company.ntn}</Text> : null}
        </View>
      </View>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      <View style={s.rule} />
    </View>
  );
}

/**
 * What the reader is looking at. Printed even when nothing is filtered — "All
 * records" is information; a missing filter block is ambiguity.
 */
export function FilterBlock({
  filters, generatedAt, generatedBy, recordCount,
}: {
  filters: FilterEntry[];
  generatedAt: string;
  generatedBy: string;
  recordCount: number;
}) {
  const shown = filters.filter((f) => f.value && f.value !== '—');

  return (
    <View style={s.filterBox}>
      <Text style={s.filterHead}>Filters applied</Text>
      <View style={s.filterLine}>
        {shown.length === 0 ? (
          <Text style={s.filterItem}>All records</Text>
        ) : (
          shown.map((f) => (
            <Text key={f.label} style={s.filterItem}>
              <Text style={s.filterLabel}>{f.label}: </Text>{f.value}
            </Text>
          ))
        )}
      </View>
      <View style={[s.filterLine, { marginTop: 3 }]}>
        <Text style={s.filterItem}>
          <Text style={s.filterLabel}>Records: </Text>{recordCount.toLocaleString('en-PK')}
        </Text>
        <Text style={s.filterItem}>
          <Text style={s.filterLabel}>Generated: </Text>{generatedAt}
        </Text>
        <Text style={s.filterItem}>
          <Text style={s.filterLabel}>By: </Text>{generatedBy}
        </Text>
      </View>
    </View>
  );
}

export type SummaryStat = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad' | 'warn';
};

/** The KPI cards from the screen, reproduced over the whole filtered set. */
export function SummaryGrid({ stats }: { stats: SummaryStat[] }) {
  if (stats.length === 0) return null;
  return (
    <View style={s.statRow}>
      {stats.map((stat) => (
        <View key={stat.label} style={s.stat}>
          <Text style={s.statLabel}>{stat.label}</Text>
          <Text style={[s.statValue, stat.tone ? { color: tokens[stat.tone] } : {}]}>
            {stat.value}
          </Text>
          {stat.hint ? <Text style={s.statHint}>{stat.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Page X of Y, on every page. */
export function ReportFooter({ note }: { note?: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{note ?? ''}</Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// ───────────────────────────────────────────────
export type Align = 'left' | 'right' | 'center';

export type Column<T> = {
  header: string;
  /** Relative width. */
  flex: number;
  align?: Align;
  value: (row: T, index: number) => string;
  /** Rendered under the value when the cell would otherwise be cramped. */
  detail?: (row: T) => string | null;
  /** Printed in the totals row. */
  total?: (rows: T[]) => string;
};

/**
 * A table that repeats its header on every page, bands alternate rows, and
 * closes with a totals row for every column that declares one. Long values
 * wrap; nothing is clipped with an ellipsis.
 */
export function DataTable<T>({
  columns, rows, emptyNote, groupBy,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyNote?: string;
  groupBy?: { label: (row: T) => string; subtotal?: (rows: T[]) => string };
}) {
  if (rows.length === 0) {
    return (
      <View>
        <Header columns={columns} />
        <Text style={s.empty}>{emptyNote ?? 'No records match the selected filters.'}</Text>
      </View>
    );
  }

  if (!groupBy) {
    return (
      <View>
        <Header columns={columns} />
        {rows.map((row, i) => <Row key={i} columns={columns} row={row} index={i} />)}
        <Totals columns={columns} rows={rows} />
      </View>
    );
  }

  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy.label(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <View>
      <Header columns={columns} />
      {[...groups.entries()].map(([label, groupRows]) => (
        <View key={label} wrap>
          <View style={s.groupRow}>
            <Text style={[s.groupText, { flex: 1 }]}>{label}</Text>
            {groupBy.subtotal ? (
              <Text style={[s.groupText, { textAlign: 'right' }]}>{groupBy.subtotal(groupRows)}</Text>
            ) : null}
          </View>
          {groupRows.map((row, i) => <Row key={i} columns={columns} row={row} index={i} />)}
        </View>
      ))}
      <Totals columns={columns} rows={rows} />
    </View>
  );
}

function Header<T>({ columns }: { columns: Column<T>[] }) {
  return (
    <View style={s.thRow} fixed>
      {columns.map((c) => (
        <Text key={c.header} style={[s.th, s.cell, { flex: c.flex, textAlign: c.align ?? 'left' }]}>
          {c.header}
        </Text>
      ))}
    </View>
  );
}

function Row<T>({ columns, row, index }: { columns: Column<T>[]; row: T; index: number }) {
  return (
    <View style={[s.tdRow, index % 2 === 1 ? s.tdRowBand : {}]} wrap={false}>
      {columns.map((c) => {
        const detail = c.detail?.(row);
        return (
          <View key={c.header} style={[s.cell, { flex: c.flex }]}>
            <Text style={[s.td, { textAlign: c.align ?? 'left' }]}>{c.value(row, index)}</Text>
            {detail ? (
              <Text style={[s.td, { fontSize: 7.5, color: tokens.muted, textAlign: c.align ?? 'left' }]}>
                {detail}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Totals<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  if (!columns.some((c) => c.total)) return null;
  return (
    <View style={s.totalRow}>
      {columns.map((c, i) => (
        <Text key={c.header} style={[s.totalText, s.cell, { flex: c.flex, textAlign: c.align ?? 'left' }]}>
          {c.total ? c.total(rows) : i === 0 ? 'TOTAL' : ''}
        </Text>
      ))}
    </View>
  );
}

// ───────────────────────────────────────────────
/** A null must read as an em dash, never as "null" or an empty cell. */
export const DASH = '—';

export function text(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return t === '' ? DASH : t;
}

export function money(paisa: number | null | undefined): string {
  return paisa === null || paisa === undefined ? DASH : formatPKR(paisa);
}

export function qty(n: number | null | undefined, unit?: string | null): string {
  if (n === null || n === undefined) return DASH;
  const rounded = Number.isInteger(n) ? n.toLocaleString('en-PK') : n.toFixed(2);
  return unit ? `${rounded} ${unit}` : rounded;
}

export function percent(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? DASH : `${n.toFixed(2)}%`;
}

export function sumMoney<T>(rows: T[], of: (row: T) => number): string {
  return formatPKR(rows.reduce((total, row) => total + of(row), 0));
}

export function sumQty<T>(rows: T[], of: (row: T) => number): string {
  return qty(rows.reduce((total, row) => total + of(row), 0));
}
