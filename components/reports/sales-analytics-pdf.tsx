// React-PDF document for the sales analytics export. Rendered server-side via
// renderToBuffer, like the rest of components/reports/pdfs.tsx.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import { percentChange } from '@/lib/sales-analytics';
import type { SalesAnalyticsData } from '@/lib/reports/sales-analytics-data';

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: '#666', marginTop: 2, marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  note: { fontSize: 8, color: '#888', marginBottom: 6 },
  thRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 5, paddingHorizontal: 4 },
  tdRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 9, fontWeight: 700 },
  td: { fontSize: 9 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpi: { borderWidth: 0.5, borderColor: '#ccc', borderRadius: 4, padding: 8, minWidth: 108 },
  kpiLabel: { fontSize: 8, color: '#666' },
  kpiValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  kpiDelta: { fontSize: 8, color: '#666', marginTop: 1 },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, fontSize: 8, color: '#999' },
});

function rangeStr(from: string, to: string) {
  return `${format(parseISO(from), 'dd MMM yyyy')} — ${format(parseISO(to), 'dd MMM yyyy')}`;
}

function delta(current: number, previous: number): string {
  const change = percentChange(current, previous);
  if (change === null) return 'no prior period';
  const arrow = change > 0 ? '+' : '';
  return `${arrow}${change.toFixed(1)}% vs previous period`;
}

export function SalesAnalyticsPDF({
  data, businessName, generatedAt,
}: {
  data: SalesAnalyticsData;
  businessName: string;
  generatedAt: string;
}) {
  const scope = data.brandName ? ` — ${data.brandName}` : '';

  return (
    <Document title="Sales Analytics">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Sales Analytics{scope} — {businessName}</Text>
        <Text style={s.meta}>{rangeStr(data.range.from, data.range.to)}</Text>

        <View style={s.kpiRow}>
          <Kpi label="Total Sales" value={formatPKR(data.current.salesPaisa)}
               sub={delta(data.current.salesPaisa, data.previous.salesPaisa)} />
          <Kpi label="Invoices" value={String(data.current.invoiceCount)}
               sub={delta(data.current.invoiceCount, data.previous.invoiceCount)} />
          <Kpi label="Qty Sold" value={String(round2(data.current.quantity))}
               sub={delta(data.current.quantity, data.previous.quantity)} />
          <Kpi label="Avg Invoice" value={formatPKR(data.current.averageInvoicePaisa)}
               sub={delta(data.current.averageInvoicePaisa, data.previous.averageInvoicePaisa)} />
          {data.costVisible && data.current.profitPaisa !== null && (
            <Kpi label="Profit" value={formatPKR(data.current.profitPaisa)}
                 sub={delta(data.current.profitPaisa, data.previous.profitPaisa ?? 0)} />
          )}
        </View>

        <Text style={s.h2}>Brand Performance</Text>
        <Text style={s.note}>Within the selected range. Quantities are net of returns.</Text>
        <Table
          head={['Brand', 'Products', 'Invoices', 'Qty', 'Sales', 'Share']}
          widths={[3, 1, 1, 1, 2, 1]}
          rows={data.brands.map((b) => [
            b.name, String(b.productCount), String(b.invoiceCount),
            String(round2(b.quantity)), formatPKR(b.salesPaisa), `${b.sharePercent.toFixed(1)}%`,
          ])}
        />

        <Text style={s.h2}>Top Customers</Text>
        <Table
          head={['Customer', 'Invoices', 'Qty', 'Sales']}
          widths={[4, 1, 1, 2]}
          rows={data.customers.slice(0, 15).map((c) => [
            c.name, String(c.invoiceCount), String(round2(c.quantity)), formatPKR(c.salesPaisa),
          ])}
        />

        <Text style={s.footer} fixed>
          Generated {generatedAt} · Khaliq Oil Company
        </Text>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.title}>Product Sales{scope}</Text>
        <Text style={s.meta}>
          Fixed windows ending today, independent of the range above. Net of returns.
        </Text>
        <Table
          head={['Product', 'Brand', '7d', '30d', '90d', 'All time']}
          widths={[3, 2, 1.4, 1.6, 1.6, 2]}
          rows={data.products.map((p) => [
            p.product_name,
            p.brand_name ?? 'Unbranded',
            formatPKR(p.sales_7d_paisa),
            formatPKR(p.sales_30d_paisa),
            formatPKR(p.sales_90d_paisa),
            formatPKR(p.sales_all_paisa),
          ])}
        />
        <Text style={s.footer} fixed>Generated {generatedAt} · Khaliq Oil Company</Text>
      </Page>

      {data.dead.length > 0 && (
        <Page size="A4" style={s.page}>
          <Text style={s.title}>Dead Stock{scope}</Text>
          <Text style={s.meta}>
            Holding stock with no sale in {data.deadStockDays} days ·{' '}
            {formatPKR(data.dead.reduce((sum, r) => sum + r.stockValuePaisa, 0))} standing still
          </Text>
          <Table
            head={data.costVisible
              ? ['Product', 'Brand', 'Stock', 'Stock Value', 'Cost Value', 'Last Sale']
              : ['Product', 'Brand', 'Stock', 'Stock Value', 'Last Sale']}
            widths={data.costVisible ? [3, 2, 1.2, 2, 2, 1.8] : [3, 2, 1.2, 2, 1.8]}
            rows={data.dead.map((r) => {
              const base = [
                r.product_name,
                r.brand_name ?? 'Unbranded',
                String(round2(r.stock_on_hand)),
                formatPKR(r.stockValuePaisa),
              ];
              const tail = r.neverSold ? 'Never sold' : `${r.days_since_last_sale} days ago`;
              return data.costVisible
                ? [...base, r.stockCostValuePaisa === null ? '—' : formatPKR(r.stockCostValuePaisa), tail]
                : [...base, tail];
            })}
          />
          <Text style={s.footer} fixed>Generated {generatedAt} · Khaliq Oil Company</Text>
        </Page>
      )}
    </Document>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {sub && <Text style={s.kpiDelta}>{sub}</Text>}
    </View>
  );
}

function Table({
  head, rows, widths,
}: {
  head: string[];
  rows: string[][];
  widths: number[];
}) {
  if (rows.length === 0) {
    return <Text style={s.note}>Nothing to show.</Text>;
  }
  return (
    <View>
      <View style={s.thRow}>
        {head.map((h, i) => (
          <Text key={h} style={[s.th, { flex: widths[i], textAlign: i === 0 ? 'left' : 'right' }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.tdRow} wrap={false}>
          {r.map((cell, ci) => (
            <Text key={ci} style={[s.td, { flex: widths[ci], textAlign: ci === 0 ? 'left' : 'right' }]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
