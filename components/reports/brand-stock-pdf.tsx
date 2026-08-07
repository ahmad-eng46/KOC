// React-PDF document for per-brand stock reports — the sheet the owner
// hands to a supplier rep. Lives outside the 'use server' action module
// (the pdfs.tsx pattern) so the preview script can render it with fixtures.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatPKR } from '@/lib/money';
import { formatKarachi } from '@/lib/date';
import type { BrandStockProduct, BrandStockSummary, ReorderItem } from '@/lib/brand-stock';
import type { BrandType } from '@/lib/validators/brands';

export type BrandStockReportData = {
  brand: {
    name: string;
    brand_type: BrandType;
    contact_person: string | null;
    phone: string | null;
  };
  products: BrandStockProduct[];
  summary: BrandStockSummary;
  reorder_items: ReorderItem[];
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  company: { fontSize: 16, fontWeight: 700, textAlign: 'center' },
  companyRule: {
    borderBottomWidth: 2, borderBottomColor: '#333',
    marginTop: 8, marginBottom: 14,
  },
  title: { fontSize: 13, fontWeight: 700 },
  meta: { fontSize: 9, color: '#555', marginTop: 2 },
  metaBlock: { marginBottom: 12 },

  thRow: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: '#999' },
  tdRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 9, fontWeight: 700 },
  td: { fontSize: 9 },
  tdOut: { fontSize: 9, color: '#c00', fontWeight: 700 },
  tdLow: { fontSize: 9, color: '#b45309', fontWeight: 700 },

  summaryBox: {
    marginTop: 14, padding: 10,
    borderWidth: 0.5, borderColor: '#ccc', borderRadius: 4,
  },
  summaryTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  summaryLabel: { fontSize: 9, color: '#555' },
  summaryValue: { fontSize: 9, fontWeight: 700 },

  // The section the rep reads first — visually loudest thing on the page.
  reorderBox: {
    marginTop: 16, padding: 12,
    borderWidth: 1.5, borderColor: '#c00', borderRadius: 4,
    backgroundColor: '#fef2f2',
  },
  reorderTitle: { fontSize: 12, fontWeight: 700, color: '#c00', marginBottom: 6 },
  reorderItem: { flexDirection: 'row', paddingVertical: 2.5 },
  reorderName: { fontSize: 10, fontWeight: 700, flex: 1 },
  reorderStatus: { fontSize: 10, fontWeight: 700, color: '#c00' },
  reorderOk: { fontSize: 10, color: '#166534', marginTop: 2 },
});

function colWidths(showCost: boolean) {
  return showCost
    ? { n: '5%', name: '39%', stock: '12%', unit: '10%', sale: '17%', cost: '17%' }
    : { n: '6%', name: '48%', stock: '14%', unit: '12%', sale: '20%', cost: '0%' };
}

export function BrandStockSection({
  data, showCost,
}: { data: BrandStockReportData; showCost: boolean }) {
  const w = colWidths(showCost);
  return (
    <>
      <View style={s.metaBlock}>
        <Text style={s.title}>STOCK REPORT — {data.brand.name.toUpperCase()}</Text>
        <Text style={s.meta}>
          Type: {data.brand.brand_type === 'local_dealer' ? 'Local Dealer' : 'Multinational Brand'}
        </Text>
        {(data.brand.contact_person || data.brand.phone) && (
          <Text style={s.meta}>
            Contact: {[data.brand.contact_person, data.brand.phone].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      <View style={s.thRow}>
        <Text style={[s.th, { width: w.n }]}>#</Text>
        <Text style={[s.th, { width: w.name }]}>Product</Text>
        <Text style={[s.th, { width: w.stock, textAlign: 'right' }]}>Stock</Text>
        <Text style={[s.th, { width: w.unit, paddingLeft: 10 }]}>Unit</Text>
        <Text style={[s.th, { width: w.sale, textAlign: 'right' }]}>Sale Price</Text>
        {showCost && (
          <Text style={[s.th, { width: w.cost, textAlign: 'right' }]}>Purchase Price</Text>
        )}
      </View>
      {data.products.map((p, i) => {
        const stockStyle =
          p.status === 'out_of_stock' ? s.tdOut : p.status === 'low' ? s.tdLow : s.td;
        return (
          <View key={p.name} style={s.tdRow}>
            <Text style={[s.td, { width: w.n }]}>{i + 1}</Text>
            <Text style={[s.td, { width: w.name }]}>{p.name}</Text>
            <Text style={[stockStyle, { width: w.stock, textAlign: 'right' }]}>{p.stock}</Text>
            <Text style={[s.td, { width: w.unit, paddingLeft: 10 }]}>{p.unit}</Text>
            <Text style={[s.td, { width: w.sale, textAlign: 'right' }]}>
              {formatPKR(p.sale_price_paisa, { showSymbol: false })}
            </Text>
            {showCost && (
              <Text style={[s.td, { width: w.cost, textAlign: 'right' }]}>
                {p.purchase_price_paisa != null
                  ? formatPKR(p.purchase_price_paisa, { showSymbol: false })
                  : '—'}
              </Text>
            )}
          </View>
        );
      })}

      <View style={s.summaryBox}>
        <Text style={s.summaryTitle}>SUMMARY</Text>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total Products</Text>
          <Text style={s.summaryValue}>{data.summary.total_products}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Total Stock</Text>
          <Text style={s.summaryValue}>{data.summary.total_stock} units</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Low Stock Items</Text>
          <Text style={s.summaryValue}>{data.summary.low_stock_count}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>Out of Stock</Text>
          <Text style={s.summaryValue}>{data.summary.out_of_stock_count}</Text>
        </View>
      </View>

      <View style={s.reorderBox}>
        {/* "!" not "⚠": U+26A0 is outside Helvetica's WinAnsi set and
            react-pdf drops it silently. */}
        <Text style={s.reorderTitle}>!  REORDER NEEDED</Text>
        {data.reorder_items.length === 0 ? (
          <Text style={s.reorderOk}>Nothing to reorder — all products are stocked.</Text>
        ) : (
          data.reorder_items.map((r) => (
            <View key={r.name} style={s.reorderItem}>
              <Text style={s.reorderName}>• {r.name}</Text>
              <Text style={s.reorderStatus}>
                {r.status === 'out_of_stock' ? 'OUT OF STOCK' : `only ${r.current_stock} left`}
              </Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

export function BrandStockPDF({
  reports, businessName, showCost, generatedAt,
}: {
  reports: BrandStockReportData[];
  businessName: string;
  /** Iron rule #3: admin/accountant only — the column is absent otherwise. */
  showCost: boolean;
  generatedAt: Date;
}) {
  return (
    <Document title="Stock Report">
      {reports.map((data) => (
        <Page key={data.brand.name} size="A4" style={s.page}>
          <Text style={s.company}>{businessName.toUpperCase()}</Text>
          <View style={s.companyRule} />
          <Text style={[s.meta, { marginBottom: 10 }]}>
            Generated: {formatKarachi(generatedAt, 'dd MMM yyyy, h:mm a')} PKT
          </Text>
          <BrandStockSection data={data} showCost={showCost} />
        </Page>
      ))}
    </Document>
  );
}

/** All-brands variant: summary page first, then one page per brand. */
export function AllBrandsStockPDF({
  reports, businessName, showCost, generatedAt,
}: {
  reports: BrandStockReportData[];
  businessName: string;
  showCost: boolean;
  generatedAt: Date;
}) {
  return (
    <Document title="Stock Report — All Brands">
      <Page size="A4" style={s.page}>
        <Text style={s.company}>{businessName.toUpperCase()}</Text>
        <View style={s.companyRule} />
        <Text style={s.title}>STOCK SUMMARY — ALL BRANDS</Text>
        <Text style={[s.meta, { marginBottom: 10 }]}>
          Generated: {formatKarachi(generatedAt, 'dd MMM yyyy, h:mm a')} PKT
        </Text>

        <View style={s.thRow}>
          <Text style={[s.th, { width: '34%' }]}>Brand</Text>
          <Text style={[s.th, { width: '16%', textAlign: 'right' }]}>Products</Text>
          <Text style={[s.th, { width: '17%', textAlign: 'right' }]}>In Stock</Text>
          <Text style={[s.th, { width: '16%', textAlign: 'right' }]}>Low</Text>
          <Text style={[s.th, { width: '17%', textAlign: 'right' }]}>Out of Stock</Text>
        </View>
        {reports.map((r) => (
          <View key={r.brand.name} style={s.tdRow}>
            <Text style={[s.td, { width: '34%' }]}>{r.brand.name}</Text>
            <Text style={[s.td, { width: '16%', textAlign: 'right' }]}>{r.summary.total_products}</Text>
            <Text style={[s.td, { width: '17%', textAlign: 'right' }]}>{r.summary.total_stock}</Text>
            <Text style={[r.summary.low_stock_count > 0 ? s.tdLow : s.td, { width: '16%', textAlign: 'right' }]}>
              {r.summary.low_stock_count}
            </Text>
            <Text style={[r.summary.out_of_stock_count > 0 ? s.tdOut : s.td, { width: '17%', textAlign: 'right' }]}>
              {r.summary.out_of_stock_count}
            </Text>
          </View>
        ))}

        {/* Combined reorder list, grouped by brand */}
        <View style={s.reorderBox}>
          <Text style={s.reorderTitle}>!  REORDER NEEDED — ALL BRANDS</Text>
          {reports.every((r) => r.reorder_items.length === 0) ? (
            <Text style={s.reorderOk}>Nothing to reorder — all products are stocked.</Text>
          ) : (
            reports
              .filter((r) => r.reorder_items.length > 0)
              .map((r) => (
                <View key={r.brand.name} style={{ marginBottom: 4 }}>
                  <Text style={[s.summaryTitle, { marginTop: 2 }]}>{r.brand.name}</Text>
                  {r.reorder_items.map((item) => (
                    <View key={item.name} style={s.reorderItem}>
                      <Text style={s.reorderName}>• {item.name}</Text>
                      <Text style={s.reorderStatus}>
                        {item.status === 'out_of_stock' ? 'OUT OF STOCK' : `only ${item.current_stock} left`}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
          )}
        </View>
      </Page>

      {reports.map((data) => (
        <Page key={data.brand.name} size="A4" style={s.page}>
          <Text style={s.company}>{businessName.toUpperCase()}</Text>
          <View style={s.companyRule} />
          <BrandStockSection data={data} showCost={showCost} />
        </Page>
      ))}
    </Document>
  );
}
