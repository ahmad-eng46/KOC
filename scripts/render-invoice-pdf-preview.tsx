/**
 * Dev-only: renders InvoicePDF to disk with fixture data so the totals block
 * can be eyeballed without going through auth + the browser.
 *   npx tsx scripts/render-invoice-pdf-preview.tsx <outDir>
 */
import { renderToFile } from '@react-pdf/renderer';
import { InvoicePDF } from '@/components/invoices/InvoicePDF';
import type { InvoiceDetail } from '@/lib/queries/invoice-detail';

const R = (rupees: number) => rupees * 100;

const base: InvoiceDetail = {
  id: 'inv-1',
  invoice_number: 'INV-0042',
  status: 'partially_paid',
  issue_date: '2026-07-30',
  due_date: '2026-08-14',
  subtotal_paisa: R(86_000),
  discount_paisa: R(1_000),
  total_paisa: R(85_000),
  paid_paisa: R(100_000),
  notes: null,
  created_at: '2026-07-30T10:00:00Z',
  customer_id: 'cust-1',
  customer_name: 'Malik Traders',
  customer_phone: '+92 300 1234567',
  customer_address: 'Shop 14, Jinnah Road, Lahore',
  business_name: 'Khaliq Oil Company',
  previous_balance_paisa: R(65_000),
  items: [
    {
      id: 'i1', product_id: 'p1', product_name: 'Engine Oil 20W-50', sku: 'EO-2050',
      unit: 'ltr', quantity: 40, unit_price_paisa: R(1_500), discount_paisa: 0,
      line_total_paisa: R(60_000),
    },
    {
      id: 'i2', product_id: 'p2', product_name: 'Gear Oil EP-90', sku: 'GO-90',
      unit: 'ltr', quantity: 20, unit_price_paisa: R(1_300), discount_paisa: 0,
      line_total_paisa: R(26_000),
    },
  ],
  payments: [
    {
      id: 'pay1', amount_paisa: R(100_000), method: 'cash', reference: null,
      payment_date: '2026-07-30', created_at: '2026-07-30T11:00:00Z',
    },
  ],
  returns: [],
};

const zeroPrev: InvoiceDetail = {
  ...base,
  invoice_number: 'INV-0043',
  paid_paisa: R(20_000),
  previous_balance_paisa: 0,
  payments: [{ ...base.payments[0], amount_paisa: R(20_000) }],
};

const nullPrev: InvoiceDetail = { ...zeroPrev, invoice_number: 'INV-0044', previous_balance_paisa: null };

const credit: InvoiceDetail = {
  ...base,
  invoice_number: 'INV-0045',
  paid_paisa: 0,
  previous_balance_paisa: R(-4_000),
  payments: [],
};

// Overpaid across the account: 85k + 65k due, 1,75,000 paid → 25k credit
const overpaid: InvoiceDetail = {
  ...base,
  invoice_number: 'INV-0046',
  paid_paisa: R(175_000),
  payments: [{ ...base.payments[0], amount_paisa: R(175_000) }],
};

// Khata (credit sale): nothing paid, remaining = full amount due
const khata: InvoiceDetail = {
  ...base,
  invoice_number: 'INV-0047',
  paid_paisa: 0,
  payments: [],
};

async function main() {
  const outDir = process.argv[2] ?? '.';
  const cases: Array<[string, InvoiceDetail]> = [
    ['with-previous-balance', base],
    ['zero-previous-balance', zeroPrev],
    ['null-previous-balance', nullPrev],
    ['credit-previous-balance', credit],
    ['overpaid-credit-balance', overpaid],
    ['khata-no-payment', khata],
  ];
  for (const [name, data] of cases) {
    await renderToFile(<InvoicePDF invoice={data} />, `${outDir}/${name}.pdf`);
    console.log('rendered', name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
