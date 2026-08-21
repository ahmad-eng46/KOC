// React-PDF documents for each report. Rendered server-side via renderToBuffer.
// (No 'use client'; @react-pdf/renderer is isomorphic for these primitives.)
//
// Every document is assembled from components/reports/pdf-kit.tsx, so all of
// them carry the same company header, the same filter block, the same repeating
// table header, the same totals row and a Page X of Y footer. Before this they
// each hand-rolled a table and several omitted their KPI cards entirely — see
// docs/pdf-export-audit.md §3.4 and §3.5.

import { Document, Page, Text, View } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import type {
  SalesData, PurchaseData, CustomerReportData, BalanceData, PLData,
  LocationReportData, DefaultersData, StockData, CashBookData, AuditData,
  ReportIdentity,
} from '@/lib/reports/data';
import {
  s, ReportHeader, FilterBlock, SummaryGrid, ReportFooter, DataTable,
  money, qty, text, percent, sumMoney, sumQty, DASH,
  type Column, type FilterEntry, type SummaryStat,
} from '@/components/reports/pdf-kit';

type Base = { identity: ReportIdentity };

function rangeStr(from: string, to: string) {
  return `${format(parseISO(from), 'dd MMM yyyy')} — ${format(parseISO(to), 'dd MMM yyyy')}`;
}

function dateCell(v: string | null | undefined): string {
  if (!v) return DASH;
  try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return DASH; }
}

/**
 * Every report is the same document with different contents, so the shell is
 * declared once. `wrap` lets the table flow across pages while the header and
 * footer repeat.
 */
function ReportDoc({
  docTitle, identity, title, subtitle, filters, recordCount, stats, landscape, children, note,
}: {
  docTitle: string;
  identity: ReportIdentity;
  title: string;
  subtitle?: string;
  filters: FilterEntry[];
  recordCount: number;
  stats: SummaryStat[];
  landscape?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Document title={docTitle}>
      <Page size="A4" orientation={landscape ? 'landscape' : 'portrait'} style={s.page} wrap>
        <ReportHeader company={identity.company} title={title} subtitle={subtitle} />
        <FilterBlock
          filters={filters}
          generatedAt={identity.generatedAt}
          generatedBy={identity.generatedBy}
          recordCount={recordCount}
        />
        {stats.length > 0 && (
          <>
            <Text style={s.h2}>Summary</Text>
            <SummaryGrid stats={stats} />
          </>
        )}
        {children}
        <ReportFooter note={note} />
      </Page>
    </Document>
  );
}

// ──────────────── SALES ────────────────
export function SalesReportPDF({ data, range, identity }: Base & {
  data: SalesData; range: { from: string; to: string };
}) {
  type Row = SalesData['rows'][number];
  const paid = data.rows.reduce((t, r) => t + r.paid_paisa, 0);
  const outstanding = data.total_paisa - paid;
  const filtered = !!data.scopeLabel;

  const columns: Column<Row>[] = [
    { header: 'Invoice', flex: 1.4, value: (r) => text(r.invoice_number) },
    { header: 'Date', flex: 1.4, value: (r) => dateCell(r.issue_date) },
    { header: 'Customer', flex: 3, value: (r) => text(r.customer_name) },
    { header: 'Total', flex: 1.6, align: 'right', value: (r) => money(r.total_paisa), total: (rows) => sumMoney(rows, (r) => r.total_paisa) },
    { header: 'Paid', flex: 1.6, align: 'right', value: (r) => money(r.paid_paisa), total: (rows) => sumMoney(rows, (r) => r.paid_paisa) },
    { header: 'Balance', flex: 1.6, align: 'right', value: (r) => money(r.total_paisa - r.paid_paisa), total: (rows) => sumMoney(rows, (r) => r.total_paisa - r.paid_paisa) },
  ];

  const stats: SummaryStat[] = [
    { label: 'Total Sales', value: formatPKR(data.total_paisa) },
    { label: 'Invoices', value: String(data.rows.length) },
    { label: 'Trading Days', value: String(data.by_day.length) },
  ];
  // Paid and outstanding are invoice-level and cannot be attributed to one
  // product line, so a filtered report omits them rather than implying a split.
  if (!filtered) {
    stats.push(
      { label: 'Total Paid', value: formatPKR(paid), tone: 'good' },
      { label: 'Outstanding', value: formatPKR(outstanding), tone: outstanding > 0 ? 'bad' : undefined },
    );
  }

  return (
    <ReportDoc
      docTitle="Sales Report"
      identity={identity}
      title={data.scopeLabel ? `Sales Report — ${data.scopeLabel}` : 'Sales Report'}
      subtitle={rangeStr(range.from, range.to)}
      filters={[
        { label: 'Period', value: rangeStr(range.from, range.to) },
        { label: 'Scope', value: data.scopeLabel ?? 'All brands and products' },
      ]}
      recordCount={data.rows.length}
      stats={stats}
      note={filtered ? 'Filtered: paid and outstanding are per invoice and are not shown.' : undefined}
      landscape
    >
      <Text style={s.h2}>Invoices</Text>
      <DataTable columns={columns} rows={data.rows} />

      {data.top_customers.length > 0 && (
        <View break={data.rows.length > 25}>
          <Text style={s.h2}>Top Customers</Text>
          <DataTable
            columns={[
              { header: 'Customer', flex: 4, value: (c: SalesData['top_customers'][number]) => text(c.customer_name) },
              { header: 'Invoices', flex: 1.4, align: 'right', value: (c) => String(c.invoice_count) },
              { header: 'Total', flex: 2, align: 'right', value: (c) => money(c.total_paisa), total: (rows) => sumMoney(rows, (c) => c.total_paisa) },
            ]}
            rows={data.top_customers}
          />
        </View>
      )}
    </ReportDoc>
  );
}

// ──────────────── PURCHASE ────────────────
export function PurchaseReportPDF({ data, range, identity }: Base & {
  data: PurchaseData; range: { from: string; to: string };
}) {
  type Row = PurchaseData['rows'][number];
  const columns: Column<Row>[] = [
    { header: 'Date', flex: 1.5, value: (r) => dateCell(r.movement_date) },
    { header: 'Product', flex: 3.4, value: (r) => text(r.product_name), detail: (r) => r.sku },
    { header: 'Qty', flex: 1.2, align: 'right', value: (r) => qty(r.quantity, r.unit), total: (rows) => sumQty(rows, (r) => r.quantity) },
    { header: 'Unit Cost', flex: 1.6, align: 'right', value: (r) => money(r.purchase_price_paisa) },
    { header: 'Value', flex: 1.8, align: 'right', value: (r) => money(r.total_value_paisa), total: (rows) => sumMoney(rows, (r) => r.total_value_paisa) },
    { header: 'Note', flex: 2.4, value: (r) => text(r.note) },
  ];

  return (
    <ReportDoc
      docTitle="Purchase Report"
      identity={identity}
      title="Purchase Report"
      subtitle={rangeStr(range.from, range.to)}
      filters={[{ label: 'Period', value: rangeStr(range.from, range.to) }]}
      recordCount={data.rows.length}
      stats={[
        { label: 'Total Purchases', value: formatPKR(data.total_value_paisa) },
        { label: 'Movements', value: String(data.rows.length) },
        { label: 'Units In', value: qty(data.rows.reduce((t, r) => t + r.quantity, 0)) },
      ]}
      landscape
    >
      <Text style={s.h2}>Stock Received</Text>
      <DataTable columns={columns} rows={data.rows} />
    </ReportDoc>
  );
}

// ──────────────── CUSTOMER ────────────────
export function CustomerReportPDF({ data, identity }: Base & { data: CustomerReportData }) {
  type Row = CustomerReportData['rows'][number];

  const invoiced = data.rows.reduce((t, r) => t + r.invoiced_paisa, 0);
  const paid = data.rows.reduce((t, r) => t + r.paid_paisa, 0);
  const outstanding = data.rows.reduce((t, r) => t + Math.max(r.balance_paisa, 0), 0);
  const owing = data.rows.filter((r) => r.balance_paisa > 0).length;

  const columns: Column<Row>[] = [
    { header: 'Customer', flex: 3.2, value: (r) => text(r.customer_name) },
    { header: 'Phone', flex: 1.8, value: (r) => text(r.phone) },
    { header: 'Invoiced', flex: 1.8, align: 'right', value: (r) => money(r.invoiced_paisa), total: (rows) => sumMoney(rows, (r) => r.invoiced_paisa) },
    { header: 'Paid', flex: 1.8, align: 'right', value: (r) => money(r.paid_paisa), total: (rows) => sumMoney(rows, (r) => r.paid_paisa) },
    { header: 'Balance', flex: 1.8, align: 'right', value: (r) => money(r.balance_paisa), total: (rows) => sumMoney(rows, (r) => r.balance_paisa) },
    { header: 'Last Activity', flex: 1.8, value: (r) => dateCell(r.last_activity) },
  ];

  return (
    <ReportDoc
      docTitle="Customer Report"
      identity={identity}
      title="Customer Report"
      subtitle="Every customer, invoiced against received"
      filters={[]}
      recordCount={data.rows.length}
      // These four were missing entirely before — the screen showed them, the
      // PDF did not (audit §3.4).
      stats={[
        { label: 'Customers', value: String(data.rows.length) },
        { label: 'Total Invoiced', value: formatPKR(invoiced) },
        { label: 'Total Received', value: formatPKR(paid), tone: 'good' },
        { label: 'Outstanding', value: formatPKR(outstanding), tone: outstanding > 0 ? 'bad' : undefined, hint: `${owing} owing` },
      ]}
      landscape
    >
      <Text style={s.h2}>Customers</Text>
      <DataTable columns={columns} rows={data.rows} />
    </ReportDoc>
  );
}

// ──────────────── RECEIVABLES ────────────────
export function BalanceReportPDF({ data, identity }: Base & { data: BalanceData }) {
  type Row = BalanceData['rows'][number];
  const columns: Column<Row>[] = [
    { header: 'Customer', flex: 3.2, value: (r) => text(r.customer_name) },
    { header: 'Phone', flex: 1.8, value: (r) => text(r.phone) },
    { header: 'Balance', flex: 2, align: 'right', value: (r) => money(r.balance_paisa), total: (rows) => sumMoney(rows, (r) => r.balance_paisa) },
    { header: 'Last Activity', flex: 1.8, value: (r) => dateCell(r.last_activity) },
    { header: 'Days', flex: 1, align: 'right', value: (r) => String(r.days_inactive) },
    { header: 'Bucket', flex: 1.2, value: (r) => r.bucket },
  ];

  return (
    <ReportDoc
      docTitle="Receivables Report"
      identity={identity}
      title="Receivables Report"
      subtitle="Outstanding balances by age"
      filters={[{ label: 'Scope', value: 'Customers with a balance above zero' }]}
      recordCount={data.rows.length}
      stats={[
        { label: 'Total Receivable', value: formatPKR(data.total_paisa), tone: 'bad' },
        { label: 'Customers', value: String(data.rows.length) },
        { label: '0–30 days', value: formatPKR(data.by_bucket['0-30']) },
        { label: '31–60 days', value: formatPKR(data.by_bucket['31-60']) },
        { label: '61–90 days', value: formatPKR(data.by_bucket['61-90']), tone: 'warn' },
        { label: '90+ days', value: formatPKR(data.by_bucket['90+']), tone: 'bad' },
      ]}
      landscape
    >
      <Text style={s.h2}>Outstanding by Customer</Text>
      <DataTable columns={columns} rows={data.rows} groupBy={{
        label: (r) => `Age ${r.bucket}`,
        subtotal: (rows) => sumMoney(rows, (r) => r.balance_paisa),
      }} />
    </ReportDoc>
  );
}

// ──────────────── PROFIT & LOSS ────────────────
export function PLReportPDF({ data, identity }: Base & { data: PLData }) {
  type Line = { label: string; amount: number; strong?: boolean };
  const lines: Line[] = [
    { label: 'Sales', amount: data.sales_paisa },
    { label: 'Less: Returns', amount: -data.returns_paisa },
    { label: 'Net Sales', amount: data.net_sales_paisa, strong: true },
    { label: 'Cost of Goods Sold', amount: -data.cogs_paisa },
    { label: 'Add: COGS on Returns', amount: data.cogs_returns_paisa },
    { label: 'Gross Profit', amount: data.gross_profit_paisa, strong: true },
    { label: 'Business Expenses', amount: -data.opex_paisa },
  ];
  if (data.include_home_in_pnl) lines.push({ label: 'Home Expenses', amount: -data.home_exp_paisa });
  lines.push({ label: 'Net Profit', amount: data.net_profit_paisa, strong: true });

  const margin = data.net_sales_paisa === 0
    ? null
    : (data.gross_profit_paisa / data.net_sales_paisa) * 100;

  return (
    <ReportDoc
      docTitle="Profit & Loss"
      identity={identity}
      title="Profit & Loss"
      subtitle={rangeStr(data.range.from, data.range.to)}
      filters={[
        { label: 'Period', value: rangeStr(data.range.from, data.range.to) },
        { label: 'Home expenses', value: data.include_home_in_pnl ? 'Included' : 'Excluded' },
      ]}
      recordCount={data.expenses_by_category.length}
      // The P&L PDF previously carried no summary at all (audit §3.4).
      stats={[
        { label: 'Net Sales', value: formatPKR(data.net_sales_paisa) },
        { label: 'Gross Profit', value: formatPKR(data.gross_profit_paisa), tone: data.gross_profit_paisa >= 0 ? 'good' : 'bad' },
        { label: 'Gross Margin', value: percent(margin) },
        { label: 'Total Expenses', value: formatPKR(data.total_exp_paisa) },
        { label: 'Net Profit', value: formatPKR(data.net_profit_paisa), tone: data.net_profit_paisa >= 0 ? 'good' : 'bad' },
      ]}
    >
      <Text style={s.h2}>Statement</Text>
      <DataTable
        columns={[
          { header: 'Line', flex: 4, value: (l: Line) => l.label },
          { header: 'Amount', flex: 2, align: 'right', value: (l) => formatPKR(l.amount) },
        ]}
        rows={lines}
      />

      {data.expenses_by_category.length > 0 && (
        <View>
          <Text style={s.h2}>Expenses by Category</Text>
          <DataTable
            columns={[
              { header: 'Category', flex: 3, value: (e: PLData['expenses_by_category'][number]) => text(e.category) },
              { header: 'Type', flex: 1.4, value: (e) => (e.type === 'home' ? 'Home' : 'Business') },
              { header: 'Amount', flex: 2, align: 'right', value: (e) => money(e.total_paisa), total: (rows) => sumMoney(rows, (e) => e.total_paisa) },
              {
                header: '% of Total', flex: 1.6, align: 'right',
                value: (e) => percent(data.total_exp_paisa === 0 ? null : (e.total_paisa / data.total_exp_paisa) * 100),
              },
            ]}
            rows={data.expenses_by_category}
          />
        </View>
      )}
    </ReportDoc>
  );
}

// ──────────────── DEFAULTERS ────────────────
export function DefaultersReportPDF({ data, identity }: Base & { data: DefaultersData }) {
  type Row = DefaultersData['rows'][number];
  const total = data.rows.reduce((t, r) => t + r.balance_paisa, 0);

  return (
    <ReportDoc
      docTitle="Defaulters Report"
      identity={identity}
      title="Defaulters Report"
      subtitle={`Customers owing with no activity for ${data.defaulter_days} days or more`}
      filters={[{ label: 'Inactive for', value: `${data.defaulter_days}+ days` }]}
      recordCount={data.rows.length}
      stats={[
        { label: 'Defaulters', value: String(data.rows.length), tone: data.rows.length > 0 ? 'bad' : 'good' },
        { label: 'Total Owed', value: formatPKR(total), tone: total > 0 ? 'bad' : undefined },
        { label: 'Threshold', value: `${data.defaulter_days} days` },
      ]}
      landscape
    >
      <Text style={s.h2}>Defaulters</Text>
      <DataTable
        columns={[
          { header: 'Customer', flex: 3.4, value: (r: Row) => text(r.customer_name) },
          { header: 'Phone', flex: 2, value: (r) => text(r.phone) },
          { header: 'Balance', flex: 2, align: 'right', value: (r) => money(r.balance_paisa), total: (rows) => sumMoney(rows, (r) => r.balance_paisa) },
          { header: 'Last Activity', flex: 2, value: (r) => dateCell(r.last_activity) },
          { header: 'Days', flex: 1.2, align: 'right', value: (r) => String(r.days_inactive) },
        ]}
        rows={data.rows}
        emptyNote="No customer is overdue by this threshold."
      />
    </ReportDoc>
  );
}

// ──────────────── STOCK ────────────────
export function StockReportPDF({ data, identity, includeCost }: Base & {
  data: StockData; includeCost: boolean;
}) {
  type Row = StockData['rows'][number];
  const retail = data.rows.reduce((t, r) => t + Math.round(r.quantity_on_hand * r.sale_price_paisa), 0);
  const lowCount = data.rows.filter((r) => r.is_low).length;
  const outCount = data.rows.filter((r) => r.quantity_on_hand <= 0).length;

  const columns: Column<Row>[] = [
    { header: 'Product', flex: 3.4, value: (r) => text(r.product_name), detail: (r) => r.sku },
    { header: 'Unit', flex: 1, value: (r) => text(r.unit) },
    { header: 'On Hand', flex: 1.3, align: 'right', value: (r) => qty(r.quantity_on_hand), total: (rows) => sumQty(rows, (r) => r.quantity_on_hand) },
    { header: 'Sale Price', flex: 1.6, align: 'right', value: (r) => money(r.sale_price_paisa) },
    { header: 'Retail Value', flex: 1.8, align: 'right', value: (r) => money(Math.round(r.quantity_on_hand * r.sale_price_paisa)), total: (rows) => sumMoney(rows, (r) => Math.round(r.quantity_on_hand * r.sale_price_paisa)) },
    // Iron rule #3: for staff and viewer these columns are not written at all.
    ...(includeCost ? [
      { header: 'Cost', flex: 1.5, align: 'right' as const, value: (r: Row) => money(r.purchase_price_paisa) },
      { header: 'Cost Value', flex: 1.8, align: 'right' as const, value: (r: Row) => money(r.value_at_cost_paisa), total: (rows: Row[]) => sumMoney(rows, (r) => r.value_at_cost_paisa) },
    ] : []),
    { header: 'Status', flex: 1.2, value: (r) => (r.quantity_on_hand <= 0 ? 'Out' : r.is_low ? 'Low' : 'OK') },
  ];

  const stats: SummaryStat[] = [
    { label: 'Products', value: String(data.rows.length) },
    { label: 'Units On Hand', value: qty(data.rows.reduce((t, r) => t + r.quantity_on_hand, 0)) },
    { label: 'Value at Retail', value: formatPKR(retail) },
    { label: 'Low Stock', value: String(lowCount), tone: lowCount > 0 ? 'warn' : undefined },
    { label: 'Out of Stock', value: String(outCount), tone: outCount > 0 ? 'bad' : undefined },
  ];
  if (includeCost) {
    stats.splice(3, 0, { label: 'Value at Cost', value: formatPKR(data.total_value_paisa) });
  }

  return (
    <ReportDoc
      docTitle="Stock Report"
      identity={identity}
      title="Stock Report"
      subtitle="Current quantities and valuation"
      filters={[{ label: 'Scope', value: 'Active products' }]}
      recordCount={data.rows.length}
      stats={stats}
      note={includeCost ? undefined : 'Cost columns are omitted for your role.'}
      landscape
    >
      <Text style={s.h2}>Stock on Hand</Text>
      <DataTable columns={columns} rows={data.rows} />
    </ReportDoc>
  );
}

// ──────────────── CASH BOOK ────────────────
export function CashBookReportPDF({ data, range, identity }: Base & {
  data: CashBookData; range: { from: string; to: string };
}) {
  type Row = CashBookData['entries'][number];
  return (
    <ReportDoc
      docTitle="Daily Cash Book"
      identity={identity}
      title="Daily Cash Book"
      subtitle={rangeStr(range.from, range.to)}
      filters={[
        { label: 'Period', value: rangeStr(range.from, range.to) },
        { label: 'Method', value: 'Cash only' },
      ]}
      recordCount={data.entries.length}
      stats={[
        { label: 'Cash In', value: formatPKR(data.total_in_paisa), tone: 'good' },
        { label: 'Cash Out', value: formatPKR(data.total_out_paisa), tone: 'bad' },
        { label: 'Closing Position', value: formatPKR(data.closing_paisa), tone: data.closing_paisa >= 0 ? 'good' : 'bad' },
        { label: 'Entries', value: String(data.entries.length) },
      ]}
    >
      <Text style={s.h2}>Movements</Text>
      <DataTable
        columns={[
          { header: 'Date', flex: 1.6, value: (r: Row) => dateCell(r.date) },
          { header: 'Description', flex: 4, value: (r) => text(r.description) },
          { header: 'In', flex: 1.8, align: 'right', value: (r) => (r.kind === 'in' ? money(r.amount_paisa) : DASH), total: (rows) => sumMoney(rows.filter((r) => r.kind === 'in'), (r) => r.amount_paisa) },
          { header: 'Out', flex: 1.8, align: 'right', value: (r) => (r.kind === 'out' ? money(r.amount_paisa) : DASH), total: (rows) => sumMoney(rows.filter((r) => r.kind === 'out'), (r) => r.amount_paisa) },
        ]}
        rows={data.entries}
        emptyNote="No cash movements in this period."
      />
    </ReportDoc>
  );
}

// ──────────────── LOCATION ────────────────
export function LocationReportPDF({ data, range, identity }: Base & {
  data: LocationReportData; range: { from: string; to: string };
}) {
  type Row = LocationReportData['rows'][number];
  return (
    <ReportDoc
      docTitle="Location Report"
      identity={identity}
      title="Location Report"
      subtitle={rangeStr(range.from, range.to)}
      filters={[{ label: 'Period', value: rangeStr(range.from, range.to) }]}
      recordCount={data.rows.length}
      stats={[
        { label: 'Locations', value: String(data.rows.length) },
        { label: 'Customers', value: String(data.rows.reduce((t, r) => t + r.customer_count, 0)) },
        { label: 'Sales', value: formatPKR(data.rows.reduce((t, r) => t + r.sales_paisa, 0)) },
        { label: 'Collected', value: formatPKR(data.rows.reduce((t, r) => t + r.paid_paisa, 0)), tone: 'good' },
        { label: 'Outstanding', value: formatPKR(data.rows.reduce((t, r) => t + r.outstanding_paisa, 0)), tone: 'bad' },
      ]}
      landscape
    >
      <Text style={s.h2}>By Location</Text>
      <DataTable
        columns={[
          { header: 'Location', flex: 2.6, value: (r: Row) => text(r.location_name) },
          { header: 'Customers', flex: 1.4, align: 'right', value: (r) => String(r.customer_count) },
          { header: 'Sales', flex: 2, align: 'right', value: (r) => money(r.sales_paisa), total: (rows) => sumMoney(rows, (r) => r.sales_paisa) },
          { header: 'Collected', flex: 2, align: 'right', value: (r) => money(r.paid_paisa), total: (rows) => sumMoney(rows, (r) => r.paid_paisa) },
          { header: 'Outstanding', flex: 2, align: 'right', value: (r) => money(r.outstanding_paisa), total: (rows) => sumMoney(rows, (r) => r.outstanding_paisa) },
        ]}
        rows={data.rows}
      />
    </ReportDoc>
  );
}

// ──────────────── AUDIT ────────────────
export function AuditReportPDF({ data, range, identity }: Base & {
  data: AuditData; range: { from: string; to: string };
}) {
  type Row = AuditData['rows'][number];
  return (
    <ReportDoc
      docTitle="Audit Report"
      identity={identity}
      title="Audit Report"
      subtitle={rangeStr(range.from, range.to)}
      filters={[{ label: 'Period', value: rangeStr(range.from, range.to) }]}
      recordCount={data.rows.length}
      stats={[
        { label: 'Entries', value: String(data.rows.length) },
        { label: 'Created', value: String(data.rows.filter((r) => r.action === 'INSERT').length) },
        { label: 'Updated', value: String(data.rows.filter((r) => r.action === 'UPDATE').length) },
        { label: 'Deleted', value: String(data.rows.filter((r) => r.action === 'DELETE').length), tone: 'bad' },
      ]}
      landscape
    >
      <Text style={s.h2}>Changes</Text>
      <DataTable
        columns={[
          { header: 'When', flex: 2, value: (r: Row) => (r.at ? format(parseISO(r.at), 'dd MMM yyyy HH:mm') : DASH) },
          { header: 'User', flex: 2.4, value: (r) => text(r.user_email) },
          { header: 'Table', flex: 2, value: (r) => text(r.table_name) },
          { header: 'Action', flex: 1.4, value: (r) => r.action },
          {
            header: 'Record', flex: 3,
            // The log stores before/after JSON, not a sentence. The row id is
            // what an auditor traces, so that is what is printed.
            value: (r) => text(r.row_id),
          },
        ]}
        rows={data.rows}
        emptyNote="No changes recorded in this period."
      />
    </ReportDoc>
  );
}
