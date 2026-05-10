'use client';

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { formatPKR } from '@/lib/money';
import type { LedgerRow } from '@/lib/queries/customer-ledger';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  brand: { fontSize: 16, fontWeight: 700 },
  title: { fontSize: 12, marginTop: 2, color: '#444' },
  meta: { textAlign: 'right', fontSize: 9, color: '#555' },

  customerBox: { marginBottom: 14 },
  customerLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase' },
  customerName: { fontSize: 13, fontWeight: 700, marginTop: 1 },
  customerSub: { fontSize: 9, color: '#444', marginTop: 1 },

  table: { borderTopWidth: 1, borderTopColor: '#ddd', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  thRow: { flexDirection: 'row', backgroundColor: '#f5f5f5', paddingVertical: 6, paddingHorizontal: 4 },
  tdRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  th: { fontSize: 9, fontWeight: 700, color: '#444' },
  td: { fontSize: 10 },
  cellDate: { width: '15%' },
  cellRef: { width: '15%' },
  cellDesc: { width: '36%' },
  cellDebit: { width: '12%', textAlign: 'right' },
  cellCredit: { width: '12%', textAlign: 'right' },
  cellBalance: { width: '10%', textAlign: 'right' },

  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6, marginTop: 4 },
  totalsLabel: { fontSize: 11, fontWeight: 700 },
  totalsValue: { fontSize: 11, fontWeight: 700 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, textAlign: 'center', fontSize: 8, color: '#888' },
});

type Props = {
  businessName: string;
  customerName: string;
  customerPhone: string | null;
  rangeFrom: string;
  rangeTo: string;
  rows: LedgerRow[];
  closingBalance: number;
};

export function CustomerStatementPDF({
  businessName, customerName, customerPhone,
  rangeFrom, rangeTo, rows, closingBalance,
}: Props) {
  return (
    <Document title={`Statement — ${customerName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{businessName}</Text>
            <Text style={styles.title}>Customer Statement</Text>
          </View>
          <View style={styles.meta}>
            <Text>Period: {format(parseISO(rangeFrom), 'dd MMM yyyy')} — {format(parseISO(rangeTo), 'dd MMM yyyy')}</Text>
            <Text>Generated: {format(new Date(), 'dd MMM yyyy HH:mm')}</Text>
          </View>
        </View>

        <View style={styles.customerBox}>
          <Text style={styles.customerLabel}>Customer</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          {customerPhone && <Text style={styles.customerSub}>{customerPhone}</Text>}
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, styles.cellDate]}>Date</Text>
            <Text style={[styles.th, styles.cellRef]}>Ref</Text>
            <Text style={[styles.th, styles.cellDesc]}>Description</Text>
            <Text style={[styles.th, styles.cellDebit]}>Debit</Text>
            <Text style={[styles.th, styles.cellCredit]}>Credit</Text>
            <Text style={[styles.th, styles.cellBalance]}>Balance</Text>
          </View>
          {rows.length === 0 && (
            <View style={styles.tdRow}>
              <Text style={[styles.td, { textAlign: 'center', width: '100%', color: '#888' }]}>
                No entries in this period.
              </Text>
            </View>
          )}
          {rows.map((r) => (
            <View key={r.id} style={styles.tdRow}>
              <Text style={[styles.td, styles.cellDate]}>
                {r.ref_type === 'opening' ? '—' : format(parseISO(r.entry_date), 'dd MMM yyyy')}
              </Text>
              <Text style={[styles.td, styles.cellRef, { fontSize: 9 }]}>
                {r.ref_type === 'opening' ? '—' : r.ref_type}
              </Text>
              <Text style={[styles.td, styles.cellDesc]}>{r.description}</Text>
              <Text style={[styles.td, styles.cellDebit]}>
                {r.debit_paisa > 0 ? formatPKR(r.debit_paisa, { showSymbol: false }) : '—'}
              </Text>
              <Text style={[styles.td, styles.cellCredit]}>
                {r.credit_paisa > 0 ? formatPKR(r.credit_paisa, { showSymbol: false }) : '—'}
              </Text>
              <Text style={[styles.td, styles.cellBalance]}>
                {formatPKR(r.running_balance, { showSymbol: false })}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>Closing Balance</Text>
          <Text style={[styles.totalsValue, { color: closingBalance > 0 ? '#c00' : '#000' }]}>
            {closingBalance < 0
              ? `${formatPKR(Math.abs(closingBalance))} (Cr)`
              : formatPKR(closingBalance)}
          </Text>
        </View>

        <Text style={styles.footer}>Generated by KOC</Text>
      </Page>
    </Document>
  );
}
