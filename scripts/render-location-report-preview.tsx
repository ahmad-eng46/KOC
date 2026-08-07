/**
 * Dev-only: renders LocationReportPDF to disk with fixture data mirroring the
 * scratch-DB fixture, so the layout and totals can be eyeballed without auth.
 *   npx tsx scripts/render-location-report-preview.tsx <outDir>
 */
import { renderToFile } from '@react-pdf/renderer';
import { LocationReportPDF } from '@/components/reports/pdfs';
import type { LocationReportData, LocationCustomerBreakdownRow } from '@/lib/reports/data';

const rajanaCustomers: LocationCustomerBreakdownRow[] = [
  { customer_name: 'Shop Owes',   phone: '03001112223', sales_paisa: 5_000_000, paid_paisa: 2_000_000, balance_paisa: 4_000_000 },
  { customer_name: 'Shop Credit', phone: null,          sales_paisa: 1_000_000, paid_paisa: 1_500_000, balance_paisa: -500_000 },
  { customer_name: 'Shop Square', phone: '03009998887', sales_paisa: 800_000,   paid_paisa: 800_000,   balance_paisa: 0 },
];

const data: LocationReportData = {
  rows: [
    {
      location_id: 'loc-rajana', location_name: 'Rajana', customer_count: 3,
      sales_paisa: 6_800_000, paid_paisa: 4_300_000, outstanding_paisa: 4_000_000,
      collection_pct: 63,
    },
    {
      location_id: 'loc-kamalia', location_name: 'Kamalia', customer_count: 0,
      sales_paisa: 0, paid_paisa: 0, outstanding_paisa: 0, collection_pct: null,
    },
    {
      location_id: null, location_name: 'Unassigned', customer_count: 1,
      sales_paisa: 0, paid_paisa: 0, outstanding_paisa: 0, collection_pct: null,
    },
  ],
  breakdown: new Map([
    ['loc-rajana', rajanaCustomers],
    [null, [{ customer_name: 'No City Shop', phone: null, sales_paisa: 0, paid_paisa: 0, balance_paisa: 0 }]],
  ]),
  total_sales_paisa: 6_800_000,
  total_paid_paisa: 4_300_000,
  total_outstanding_paisa: 4_000_000,
};

async function main() {
  const outDir = process.argv[2] ?? '.';
  await renderToFile(
    <LocationReportPDF
      data={data}
      range={{ from: '2026-08-01', to: '2026-08-31' }}
      businessName="Khaliq Oil Company"
    />,
    `${outDir}/location-report.pdf`,
  );
  console.log('rendered location-report');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
