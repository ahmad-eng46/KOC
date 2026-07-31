'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import { computeInvoiceTotals } from '@/lib/invoice-totals';
import type { InvoiceDetail } from '@/lib/queries/invoice-detail';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  brand: { fontSize: 18, fontWeight: 700 },
  brandSub: { color: '#666', marginTop: 2 },
  invoiceMeta: { textAlign: 'right' },
  invoiceLabel: { fontSize: 9, color: '#666' },
  invoiceNumber: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
  twoCol: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  col: { width: '48%' },
  colHeader: { fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 },
  colBody: { fontSize: 11, fontWeight: 700 },
  colSub: { fontSize: 9, color: '#444', marginTop: 1 },

  table: { borderTopWidth: 1, borderTopColor: '#ddd', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableHead: { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingVertical: 6, paddingHorizontal: 4 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 9, fontWeight: 700, color: '#444' },
  td: { fontSize: 10 },
  cellName: { width: '46%' },
  cellQty: { width: '14%', textAlign: 'right' },
  cellRate: { width: '20%', textAlign: 'right' },
  cellAmount: { width: '20%', textAlign: 'right' },

  totals: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalsBox: { width: '50%' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalsLabel: { fontSize: 10, color: '#666' },
  totalsValue: { fontSize: 10 },
  totalsGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  grandLabel: { fontSize: 11, fontWeight: 700 },
  grandValue: { fontSize: 11, fontWeight: 700 },
  totalsRule: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: '#999',
  },

  payments: { marginTop: 18 },
  paymentsTitle: { fontSize: 10, fontWeight: 700, marginBottom: 6 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, textAlign: 'center', fontSize: 8, color: '#888' },
});

export function InvoicePDF({ invoice }: { invoice: InvoiceDetail }) {
  const totals = computeInvoiceTotals(invoice);
  return (
    <Document title={`Invoice ${invoice.invoice_number}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{invoice.business_name}</Text>
            <Text style={styles.brandSub}>Invoice</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            <Text style={styles.invoiceLabel}>
              Issued: {format(parseISO(invoice.issue_date), 'dd MMM yyyy')}
            </Text>
            {invoice.due_date && (
              <Text style={styles.invoiceLabel}>
                Due: {format(parseISO(invoice.due_date), 'dd MMM yyyy')}
              </Text>
            )}
            <Text style={styles.invoiceLabel}>Status: {invoice.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>

        {/* Bill to */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colHeader}>Bill To</Text>
            <Text style={styles.colBody}>{invoice.customer_name}</Text>
            {invoice.customer_phone && <Text style={styles.colSub}>{invoice.customer_phone}</Text>}
            {invoice.customer_address && <Text style={styles.colSub}>{invoice.customer_address}</Text>}
          </View>
        </View>

        {/* Items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.cellName]}>Item</Text>
            <Text style={[styles.th, styles.cellQty]}>Qty</Text>
            <Text style={[styles.th, styles.cellRate]}>Rate</Text>
            <Text style={[styles.th, styles.cellAmount]}>Amount</Text>
          </View>
          {invoice.items.map((it) => (
            <View key={it.id} style={styles.tableRow}>
              <View style={styles.cellName}>
                <Text style={styles.td}>{it.product_name}</Text>
                {it.sku && <Text style={{ fontSize: 8, color: '#888' }}>{it.sku}</Text>}
              </View>
              <Text style={[styles.td, styles.cellQty]}>{it.quantity} {it.unit}</Text>
              <Text style={[styles.td, styles.cellRate]}>{formatPKR(it.unit_price_paisa, { showSymbol: false })}</Text>
              <Text style={[styles.td, styles.cellAmount]}>{formatPKR(it.line_total_paisa, { showSymbol: false })}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>{formatPKR(invoice.subtotal_paisa)}</Text>
            </View>
            {invoice.discount_paisa > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Discount</Text>
                <Text style={styles.totalsValue}>− {formatPKR(totals.discountPaisa)}</Text>
              </View>
            )}

            {totals.showPreviousBalance ? (
              <>
                <View style={styles.totalsRule}>
                  <Text style={[styles.totalsLabel, { color: '#000' }]}>Invoice Total</Text>
                  <Text style={styles.totalsValue}>{formatPKR(totals.invoiceTotalPaisa)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Previous Balance</Text>
                  <Text style={styles.totalsValue}>{formatPKR(totals.previousBalancePaisa)}</Text>
                </View>
                <View style={styles.totalsGrand}>
                  <Text style={styles.grandLabel}>Total Due</Text>
                  <Text style={styles.grandValue}>{formatPKR(totals.totalDuePaisa)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Paid (this invoice)</Text>
                  <Text style={styles.totalsValue}>{formatPKR(totals.paidPaisa)}</Text>
                </View>
                <View style={styles.totalsRule}>
                  <Text style={[styles.totalsLabel, { fontWeight: 700, color: '#000' }]}>Balance Due</Text>
                  <Text
                    style={[
                      styles.totalsValue,
                      { fontWeight: 700, color: totals.balanceDuePaisa > 0 ? '#c00' : '#000' },
                    ]}
                  >
                    {formatPKR(totals.balanceDuePaisa)}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.totalsGrand}>
                  <Text style={styles.grandLabel}>Total</Text>
                  <Text style={styles.grandValue}>{formatPKR(totals.invoiceTotalPaisa)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={styles.totalsLabel}>Paid</Text>
                  <Text style={styles.totalsValue}>{formatPKR(totals.paidPaisa)}</Text>
                </View>
                <View style={styles.totalsRow}>
                  <Text style={[styles.totalsLabel, { fontWeight: 700 }]}>Balance Due</Text>
                  <Text
                    style={[
                      styles.totalsValue,
                      { fontWeight: 700, color: totals.balanceDuePaisa > 0 ? '#c00' : '#000' },
                    ]}
                  >
                    {formatPKR(totals.balanceDuePaisa)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Payments */}
        {invoice.payments.length > 0 && (
          <View style={styles.payments}>
            <Text style={styles.paymentsTitle}>Payments Received</Text>
            {invoice.payments.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: '#444' }}>
                  {format(parseISO(p.payment_date), 'dd MMM yyyy')} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ''}
                </Text>
                <Text style={{ fontSize: 9 }}>{formatPKR(p.amount_paisa)}</Text>
              </View>
            ))}
          </View>
        )}

        {invoice.notes && !invoice.notes.startsWith('[DELETED') && (
          <View style={{ marginTop: 18 }}>
            <Text style={{ fontSize: 9, color: '#666' }}>Notes:</Text>
            <Text style={{ fontSize: 9 }}>{invoice.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Generated by KOC · {format(new Date(), 'dd MMM yyyy HH:mm')}</Text>
      </Page>
    </Document>
  );
}
