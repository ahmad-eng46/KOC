// React-PDF document for the expense analytics export. Lives outside the
// 'use server' action module (matching pdfs.tsx) so preview scripts can
// render it with fixture data.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { formatPKR } from '@/lib/money';
import {
  buildAssetBreakdown, buildSubTypeShares, buildHeadline,
  PERIOD_LABELS, type PeriodKey,
} from '@/lib/expense-analytics';
import type { ExpenseSummaryRow } from '@/lib/queries/expense-assets';

const TABLE_PERIODS: PeriodKey[] = ['thisMonth', 'lastMonth', 'threeMonths', 'sixMonths', 'year', 'total'];

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: '#666', marginTop: 2, marginBottom: 14 },
  thRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 5, paddingHorizontal: 4 },
  tdRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 8, fontWeight: 700 },
  td: { fontSize: 8 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpi: { borderWidth: 0.5, borderColor: '#ccc', borderRadius: 4, padding: 8, minWidth: 110 },
  kpiLabel: { fontSize: 8, color: '#666' },
  kpiValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },
});

export function ExpenseAnalyticsPDF({
  rows, businessName, now,
}: { rows: ExpenseSummaryRow[]; businessName: string; now: Date }) {
  const breakdown = buildAssetBreakdown(rows, now);
  const headline = buildHeadline(rows, now, 1);

  const colW = { item: '22%', cat: '14%', num: '10.6%' } as const;

  return (
    <Document title="Expense Report">
      <Page size="A4" style={s.page} orientation="landscape">
        <Text style={s.title}>{businessName} — Expense Report by Item</Text>
        <Text style={s.meta}>Generated {format(now, 'dd MMM yyyy')}</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>This Month</Text>
            <Text style={s.kpiValue}>{formatPKR(headline.totalPaisa)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Top Category</Text>
            <Text style={s.kpiValue}>{headline.topCategory?.name ?? '—'}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Top Item</Text>
            <Text style={s.kpiValue}>{headline.topAsset?.name ?? '—'}</Text>
          </View>
        </View>

        <View style={s.thRow}>
          <Text style={[s.th, { width: colW.item }]}>Item</Text>
          <Text style={[s.th, { width: colW.cat }]}>Category</Text>
          {TABLE_PERIODS.map((p) => (
            <Text key={p} style={[s.th, { width: colW.num, textAlign: 'right' }]}>
              {PERIOD_LABELS[p]}
            </Text>
          ))}
        </View>
        {breakdown.map((r) => (
          <View key={r.key} style={s.tdRow}>
            <Text style={[s.td, { width: colW.item }]}>{r.assetName}</Text>
            <Text style={[s.td, { width: colW.cat }]}>{r.category}</Text>
            {TABLE_PERIODS.map((p) => (
              <Text key={p} style={[s.td, { width: colW.num, textAlign: 'right' }]}>
                {r.periods[p] === 0 ? '—' : formatPKR(r.periods[p], { showSymbol: false })}
              </Text>
            ))}
          </View>
        ))}
      </Page>

      {/* One page per tracked asset with its sub-type split */}
      {breakdown
        .filter((r) => r.key !== 'untracked' && r.periods.total > 0)
        .map((r) => {
          const shares = buildSubTypeShares(rows, r.key, now);
          return (
            <Page key={r.key} size="A4" style={s.page}>
              <Text style={s.title}>{r.assetName}</Text>
              <Text style={s.meta}>
                {r.category} · total {formatPKR(r.periods.total)}
              </Text>
              <View style={s.thRow}>
                <Text style={[s.th, { width: '50%' }]}>Expense Type</Text>
                <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Share</Text>
                <Text style={[s.th, { width: '30%', textAlign: 'right' }]}>Amount</Text>
              </View>
              {shares.map((sh) => (
                <View key={sh.name} style={s.tdRow}>
                  <Text style={[s.td, { width: '50%' }]}>{sh.name}</Text>
                  <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{sh.pct}%</Text>
                  <Text style={[s.td, { width: '30%', textAlign: 'right' }]}>
                    {formatPKR(sh.paisa, { showSymbol: false })}
                  </Text>
                </View>
              ))}
            </Page>
          );
        })}
    </Document>
  );
}
