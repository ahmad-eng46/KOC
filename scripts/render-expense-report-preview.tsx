/**
 * Dev-only: renders ExpenseAnalyticsPDF to disk with the same fixture the
 * unit tests use, so layout is checkable without auth.
 *   npx tsx scripts/render-expense-report-preview.tsx <outDir>
 */
import { renderToFile } from '@react-pdf/renderer';
import { ExpenseAnalyticsPDF } from '@/components/reports/expense-pdfs';
import type { ExpenseSummaryRow } from '@/lib/queries/expense-assets';

const R = (rupees: number) => rupees * 100;

function row(partial: Partial<ExpenseSummaryRow>): ExpenseSummaryRow {
  return {
    type: 'business',
    category: 'Transport',
    asset_id: 'car-1',
    asset_name: 'Car LHR-1234',
    asset_type: 'car',
    sub_type_id: 'st-1',
    sub_type_name: 'Petrol',
    expense_month: '2026-08-01',
    transaction_count: 1,
    total_paisa: 0,
    ...partial,
  };
}

const rows: ExpenseSummaryRow[] = [
  row({ expense_month: '2026-08-01', sub_type_name: 'Petrol', total_paisa: R(8_000) }),
  row({ expense_month: '2026-07-01', sub_type_name: 'Oil Change', category: 'Maintenance', total_paisa: R(4_000) }),
  row({ expense_month: '2026-03-01', sub_type_name: 'Petrol', total_paisa: R(3_000) }),
  row({ expense_month: '2026-06-01', sub_type_name: 'Tyre Change', category: 'Maintenance', total_paisa: R(15_000) }),
  row({ asset_id: 'car-2', asset_name: 'Car FSD-5678', expense_month: '2026-08-01', sub_type_name: 'Diesel', total_paisa: R(5_000) }),
  row({ asset_id: 'shop-1', asset_name: 'Shop 1 Rajana', category: 'Rent', sub_type_name: 'Monthly Rent', expense_month: '2026-08-01', total_paisa: R(25_000) }),
  row({ asset_id: 'shop-1', asset_name: 'Shop 1 Rajana', category: 'Rent', sub_type_name: 'Monthly Rent', expense_month: '2026-07-01', total_paisa: R(25_000) }),
  row({ asset_id: null, asset_name: null, sub_type_id: null, sub_type_name: null, category: 'Food', expense_month: '2026-08-01', total_paisa: R(3_000) }),
  // A big number to prove the lakh grouping in print: Rs 1,50,000
  row({ asset_id: 'shop-1', asset_name: 'Shop 1 Rajana', category: 'Rent', sub_type_name: 'Advance', expense_month: '2026-01-01', total_paisa: R(150_000) }),
];

async function main() {
  const outDir = process.argv[2] ?? '.';
  await renderToFile(
    <ExpenseAnalyticsPDF
      rows={rows}
      businessName="Khaliq Oil Company"
      now={new Date('2026-08-08T12:00:00Z')}
    />,
    `${outDir}/expense-report.pdf`,
  );
  console.log('rendered expense-report');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
