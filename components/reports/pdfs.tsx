// React-PDF documents for each report. Used server-side via renderToBuffer.
// (No 'use client'; @react-pdf/renderer is isomorphic for these primitives.)

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import type {
  SalesData, PurchaseData, CustomerReportData, BalanceData, PLData,
} from '@/lib/reports/data';

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  title: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: '#666', marginTop: 2, marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  thRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 5, paddingHorizontal: 4 },
  tdRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 9, fontWeight: 700 },
  td: { fontSize: 9 },
  totalRow: { flexDirection: 'row', backgroundColor: '#fafafa', paddingVertical: 6, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#000', marginTop: 4 },
  totalText: { fontSize: 10, fontWeight: 700 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpi: { borderWidth: 0.5, borderColor: '#ccc', borderRadius: 4, padding: 8, minWidth: 120 },
  kpiLabel: { fontSize: 8, color: '#666' },
  kpiValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },
});

function rangeStr(from: string, to: string) {
  return `${format(parseISO(from), 'dd MMM yyyy')} — ${format(parseISO(to), 'dd MMM yyyy')}`;
}

// ──────────────── SALES ────────────────
export function SalesReportPDF({ data, range, businessName }: {
  data: SalesData; range: { from: string; to: string }; businessName: string;
}) {
  return (
    <Document title="Sales Report">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Sales Report — {businessName}</Text>
        <Text style={s.meta}>{rangeStr(range.from, range.to)}</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total Sales</Text>
            <Text style={s.kpiValue}>{formatPKR(data.total_paisa)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Invoice Count</Text>
            <Text style={s.kpiValue}>{data.rows.length}</Text>
          </View>
        </View>

        <Text style={s.h2}>Top 10 Customers</Text>
        <View style={s.thRow}>
          <Text style={[s.th, { width: '60%' }]}>Customer</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Invoices</Text>
          <Text style={[s.th, { width: '25%', textAlign: 'right' }]}>Total</Text>
        </View>
        {data.top_customers.map((r) => (
          <View key={r.customer_name} style={s.tdRow}>
            <Text style={[s.td, { width: '60%' }]}>{r.customer_name}</Text>
            <Text style={[s.td, { width: '15%', textAlign: 'right' }]}>{r.invoice_count}</Text>
            <Text style={[s.td, { width: '25%', textAlign: 'right' }]}>{formatPKR(r.total_paisa)}</Text>
          </View>
        ))}

        <Text style={s.h2}>Invoices</Text>
        <View style={s.thRow}>
          <Text style={[s.th, { width: '15%' }]}>Date</Text>
          <Text style={[s.th, { width: '20%' }]}>Number</Text>
          <Text style={[s.th, { width: '40%' }]}>Customer</Text>
          <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Total</Text>
          <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Paid</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.invoice_number} style={s.tdRow}>
            <Text style={[s.td, { width: '15%' }]}>{format(parseISO(r.issue_date), 'dd MMM yyyy')}</Text>
            <Text style={[s.td, { width: '20%' }]}>{r.invoice_number}</Text>
            <Text style={[s.td, { width: '40%' }]}>{r.customer_name}</Text>
            <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{formatPKR(r.total_paisa, { showSymbol: false })}</Text>
            <Text style={[s.td, { width: '13%', textAlign: 'right' }]}>{formatPKR(r.paid_paisa, { showSymbol: false })}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

// ──────────────── PURCHASE ────────────────
export function PurchaseReportPDF({ data, range, businessName }: {
  data: PurchaseData; range: { from: string; to: string }; businessName: string;
}) {
  return (
    <Document title="Purchase Report">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Purchase Report — {businessName}</Text>
        <Text style={s.meta}>{rangeStr(range.from, range.to)}</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total Value</Text>
            <Text style={s.kpiValue}>{formatPKR(data.total_value_paisa)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Movements</Text>
            <Text style={s.kpiValue}>{data.rows.length}</Text>
          </View>
        </View>

        <Text style={s.h2}>By Product</Text>
        <View style={s.thRow}>
          <Text style={[s.th, { width: '60%' }]}>Product</Text>
          <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Quantity</Text>
          <Text style={[s.th, { width: '20%', textAlign: 'right' }]}>Value</Text>
        </View>
        {data.by_product.map((r) => (
          <View key={r.product_name} style={s.tdRow}>
            <Text style={[s.td, { width: '60%' }]}>{r.product_name}</Text>
            <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{r.quantity}</Text>
            <Text style={[s.td, { width: '20%', textAlign: 'right' }]}>{formatPKR(r.total_value_paisa)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

// ──────────────── CUSTOMER ────────────────
export function CustomerReportPDF({ data, businessName }: {
  data: CustomerReportData; businessName: string;
}) {
  return (
    <Document title="Customer Report">
      <Page size="A4" style={s.page} orientation="landscape">
        <Text style={s.title}>Customer Report — {businessName}</Text>
        <Text style={s.meta}>{format(new Date(), 'dd MMM yyyy HH:mm')}</Text>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '28%' }]}>Customer</Text>
          <Text style={[s.th, { width: '15%' }]}>Phone</Text>
          <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Invoiced</Text>
          <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Paid</Text>
          <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Balance</Text>
          <Text style={[s.th, { width: '15%' }]}>Last Activity</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.customer_name} style={s.tdRow}>
            <Text style={[s.td, { width: '28%' }]}>{r.customer_name}</Text>
            <Text style={[s.td, { width: '15%' }]}>{r.phone ?? '—'}</Text>
            <Text style={[s.td, { width: '14%', textAlign: 'right' }]}>{formatPKR(r.invoiced_paisa, { showSymbol: false })}</Text>
            <Text style={[s.td, { width: '14%', textAlign: 'right' }]}>{formatPKR(r.paid_paisa, { showSymbol: false })}</Text>
            <Text style={[s.td, { width: '14%', textAlign: 'right', color: r.balance_paisa > 0 ? '#c00' : '#000' }]}>
              {formatPKR(r.balance_paisa, { showSymbol: false })}
            </Text>
            <Text style={[s.td, { width: '15%' }]}>{r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : '—'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

// ──────────────── BALANCE ────────────────
export function BalanceReportPDF({ data, businessName }: {
  data: BalanceData; businessName: string;
}) {
  return (
    <Document title="Receivables Report">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Receivables (Aging) — {businessName}</Text>
        <Text style={s.meta}>{format(new Date(), 'dd MMM yyyy HH:mm')}</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total Receivable</Text>
            <Text style={s.kpiValue}>{formatPKR(data.total_paisa)}</Text>
          </View>
          {(['0-30', '31-60', '61-90', '90+'] as const).map((b) => (
            <View key={b} style={s.kpi}>
              <Text style={s.kpiLabel}>{b} days</Text>
              <Text style={s.kpiValue}>{formatPKR(data.by_bucket[b])}</Text>
            </View>
          ))}
        </View>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '34%' }]}>Customer</Text>
          <Text style={[s.th, { width: '17%' }]}>Phone</Text>
          <Text style={[s.th, { width: '15%' }]}>Last Activity</Text>
          <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Days</Text>
          <Text style={[s.th, { width: '10%' }]}>Bucket</Text>
          <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Balance</Text>
        </View>
        {data.rows
          .sort((a, b) => b.balance_paisa - a.balance_paisa)
          .map((r) => (
            <View key={r.customer_name} style={s.tdRow}>
              <Text style={[s.td, { width: '34%' }]}>{r.customer_name}</Text>
              <Text style={[s.td, { width: '17%' }]}>{r.phone ?? '—'}</Text>
              <Text style={[s.td, { width: '15%' }]}>{r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : 'Never'}</Text>
              <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{r.days_inactive}</Text>
              <Text style={[s.td, { width: '10%' }]}>{r.bucket}</Text>
              <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{formatPKR(r.balance_paisa, { showSymbol: false })}</Text>
            </View>
          ))}
      </Page>
    </Document>
  );
}

// ──────────────── P&L ────────────────
export function PLReportPDF({ data }: { data: PLData }) {
  return (
    <Document title="Profit & Loss Report">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Profit & Loss — {data.business_name}</Text>
        <Text style={s.meta}>{rangeStr(data.range.from, data.range.to)}</Text>

        <Text style={s.h2}>Revenue</Text>
        <PLLine label="Sales" value={data.sales_paisa} />
        <PLLine label="Less: Returns" value={-data.returns_paisa} />
        <PLLine label="Net Sales" value={data.net_sales_paisa} bold />

        <Text style={s.h2}>Cost of Goods Sold</Text>
        <PLLine label="COGS (sold)" value={data.cogs_paisa} />
        <PLLine label="Less: COGS reversed by returns" value={-data.cogs_returns_paisa} />
        <PLLine label="Net COGS" value={data.net_cogs_paisa} bold />

        <View style={s.totalRow}>
          <Text style={[s.totalText, { flex: 1 }]}>Gross Profit</Text>
          <Text style={[s.totalText, { textAlign: 'right' }]}>{formatPKR(data.gross_profit_paisa)}</Text>
        </View>

        <Text style={s.h2}>Expenses</Text>
        <PLLine label="Operating Expenses (business)" value={data.opex_paisa} />
        <PLLine
          label={`Home Expenses (${data.include_home_in_pnl ? 'included' : 'excluded'} per setting)`}
          value={data.include_home_in_pnl ? data.home_exp_paisa : 0}
        />
        <PLLine label="Total Expenses" value={data.total_exp_paisa} bold />

        <View style={s.totalRow}>
          <Text style={[s.totalText, { flex: 1 }]}>Net Profit</Text>
          <Text style={[s.totalText, { textAlign: 'right', color: data.net_profit_paisa < 0 ? '#c00' : '#070' }]}>
            {formatPKR(data.net_profit_paisa)}
          </Text>
        </View>

        <Text style={s.h2}>Expenses by Category</Text>
        <View style={s.thRow}>
          <Text style={[s.th, { width: '50%' }]}>Category</Text>
          <Text style={[s.th, { width: '20%' }]}>Type</Text>
          <Text style={[s.th, { width: '30%', textAlign: 'right' }]}>Total</Text>
        </View>
        {data.expenses_by_category.map((c, i) => (
          <View key={`${c.category}-${c.type}-${i}`} style={s.tdRow}>
            <Text style={[s.td, { width: '50%' }]}>{c.category}</Text>
            <Text style={[s.td, { width: '20%', textTransform: 'capitalize' }]}>{c.type}</Text>
            <Text style={[s.td, { width: '30%', textAlign: 'right' }]}>{formatPKR(c.total_paisa)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

function PLLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 3 }}>
      <Text style={[bold ? s.totalText : s.td, { flex: 1 }]}>{label}</Text>
      <Text style={[bold ? s.totalText : s.td, { textAlign: 'right' }]}>
        {value < 0 ? `(${formatPKR(Math.abs(value))})` : formatPKR(value)}
      </Text>
    </View>
  );
}

// ──────────────── DEFAULTERS ────────────────
import type { DefaultersData, StockData, CashBookData, AuditData } from '@/lib/reports/data';

export function DefaultersReportPDF({ data, businessName }: { data: DefaultersData; businessName: string }) {
  const total = data.rows.reduce((sum, r) => sum + r.balance_paisa, 0);
  return (
    <Document title="Defaulter List">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Defaulter List — {businessName}</Text>
        <Text style={s.meta}>{format(new Date(), 'dd MMM yyyy HH:mm')} · Threshold: {data.defaulter_days} days</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Defaulters</Text>
            <Text style={s.kpiValue}>{data.rows.length}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total Outstanding</Text>
            <Text style={s.kpiValue}>{formatPKR(total)}</Text>
          </View>
        </View>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '34%' }]}>Customer</Text>
          <Text style={[s.th, { width: '18%' }]}>Phone</Text>
          <Text style={[s.th, { width: '18%' }]}>Last Activity</Text>
          <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Days</Text>
          <Text style={[s.th, { width: '18%', textAlign: 'right' }]}>Balance</Text>
        </View>
        {data.rows.map((r) => (
          <View key={r.customer_name} style={s.tdRow}>
            <Text style={[s.td, { width: '34%' }]}>{r.customer_name}</Text>
            <Text style={[s.td, { width: '18%' }]}>{r.phone ?? '—'}</Text>
            <Text style={[s.td, { width: '18%' }]}>{r.last_activity ? format(parseISO(r.last_activity), 'dd MMM yyyy') : 'Never'}</Text>
            <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{r.days_inactive}</Text>
            <Text style={[s.td, { width: '18%', textAlign: 'right', color: '#c00' }]}>{formatPKR(r.balance_paisa, { showSymbol: false })}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

// ──────────────── STOCK ────────────────
export function StockReportPDF({ data, businessName, includeCost }: {
  data: StockData; businessName: string; includeCost: boolean;
}) {
  return (
    <Document title="Stock Report">
      <Page size="A4" style={s.page} orientation="landscape">
        <Text style={s.title}>Stock Report — {businessName}</Text>
        <Text style={s.meta}>{format(new Date(), 'dd MMM yyyy HH:mm')}</Text>

        {includeCost && (
          <View style={s.kpiRow}>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Total Value (cost)</Text>
              <Text style={s.kpiValue}>{formatPKR(data.total_value_paisa)}</Text>
            </View>
            <View style={s.kpi}>
              <Text style={s.kpiLabel}>Products</Text>
              <Text style={s.kpiValue}>{data.rows.length}</Text>
            </View>
          </View>
        )}

        <View style={s.thRow}>
          <Text style={[s.th, { width: '32%' }]}>Product</Text>
          <Text style={[s.th, { width: '12%' }]}>SKU</Text>
          <Text style={[s.th, { width: '8%' }]}>Unit</Text>
          <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>On Hand</Text>
          <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Sale Price</Text>
          {includeCost && <Text style={[s.th, { width: '11%', textAlign: 'right' }]}>Cost</Text>}
          {includeCost && <Text style={[s.th, { width: '11%', textAlign: 'right' }]}>Value</Text>}
        </View>
        {data.rows.map((r) => (
          <View key={r.product_name} style={[s.tdRow, r.is_low ? { backgroundColor: '#fff7e0' } : {}]}>
            <Text style={[s.td, { width: '32%' }]}>{r.product_name}{r.is_low ? ' ⚠' : ''}</Text>
            <Text style={[s.td, { width: '12%' }]}>{r.sku ?? '—'}</Text>
            <Text style={[s.td, { width: '8%' }]}>{r.unit}</Text>
            <Text style={[s.td, { width: '12%', textAlign: 'right' }]}>{r.quantity_on_hand}</Text>
            <Text style={[s.td, { width: '14%', textAlign: 'right' }]}>{formatPKR(r.sale_price_paisa, { showSymbol: false })}</Text>
            {includeCost && <Text style={[s.td, { width: '11%', textAlign: 'right' }]}>{r.purchase_price_paisa != null ? formatPKR(r.purchase_price_paisa, { showSymbol: false }) : '—'}</Text>}
            {includeCost && <Text style={[s.td, { width: '11%', textAlign: 'right' }]}>{formatPKR(r.value_at_cost_paisa, { showSymbol: false })}</Text>}
          </View>
        ))}
      </Page>
    </Document>
  );
}

// ──────────────── CASH BOOK ────────────────
export function CashBookReportPDF({ data, range, businessName }: {
  data: CashBookData; range: { from: string; to: string }; businessName: string;
}) {
  return (
    <Document title="Daily Cash Book">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Daily Cash Book — {businessName}</Text>
        <Text style={s.meta}>{rangeStr(range.from, range.to)}</Text>

        <View style={s.kpiRow}>
          <View style={s.kpi}><Text style={s.kpiLabel}>Cash In</Text><Text style={[s.kpiValue, { color: '#070' }]}>{formatPKR(data.total_in_paisa)}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Cash Out</Text><Text style={[s.kpiValue, { color: '#c00' }]}>{formatPKR(data.total_out_paisa)}</Text></View>
          <View style={s.kpi}><Text style={s.kpiLabel}>Closing</Text><Text style={s.kpiValue}>{formatPKR(data.closing_paisa)}</Text></View>
        </View>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '15%' }]}>Date</Text>
          <Text style={[s.th, { width: '55%' }]}>Description</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>In</Text>
          <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Out</Text>
        </View>
        {data.entries.map((e, i) => (
          <View key={i} style={s.tdRow}>
            <Text style={[s.td, { width: '15%' }]}>{format(parseISO(e.date), 'dd MMM yyyy')}</Text>
            <Text style={[s.td, { width: '55%' }]}>{e.description}</Text>
            <Text style={[s.td, { width: '15%', textAlign: 'right', color: '#070' }]}>{e.kind === 'in' ? formatPKR(e.amount_paisa, { showSymbol: false }) : ''}</Text>
            <Text style={[s.td, { width: '15%', textAlign: 'right', color: '#c00' }]}>{e.kind === 'out' ? formatPKR(e.amount_paisa, { showSymbol: false }) : ''}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={[s.totalText, { width: '70%' }]}>Closing Balance</Text>
          <Text style={[s.totalText, { width: '30%', textAlign: 'right' }]}>{formatPKR(data.closing_paisa)}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ──────────────── AUDIT ────────────────
export function AuditReportPDF({ data, range }: {
  data: AuditData; range: { from: string; to: string };
}) {
  return (
    <Document title="Audit Log">
      <Page size="A4" style={s.page} orientation="landscape">
        <Text style={s.title}>Audit Log</Text>
        <Text style={s.meta}>{rangeStr(range.from, range.to)} · {data.rows.length} events (last 500)</Text>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '18%' }]}>Time</Text>
          <Text style={[s.th, { width: '24%' }]}>User</Text>
          <Text style={[s.th, { width: '20%' }]}>Table</Text>
          <Text style={[s.th, { width: '12%' }]}>Action</Text>
          <Text style={[s.th, { width: '26%' }]}>Row</Text>
        </View>
        {data.rows.map((r, i) => (
          <View key={i} style={s.tdRow}>
            <Text style={[s.td, { width: '18%' }]}>{format(parseISO(r.at), 'dd MMM HH:mm:ss')}</Text>
            <Text style={[s.td, { width: '24%' }]}>{r.user_email ?? 'system'}</Text>
            <Text style={[s.td, { width: '20%' }]}>{r.table_name}</Text>
            <Text style={[s.td, { width: '12%' }]}>{r.action}</Text>
            <Text style={[s.td, { width: '26%', fontFamily: 'Courier' }]}>{r.row_id.slice(0, 12)}…</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
