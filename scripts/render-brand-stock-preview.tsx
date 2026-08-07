/**
 * Dev-only: renders the brand stock PDFs to disk with fixture data so the
 * layout — especially the REORDER NEEDED block — can be eyeballed without
 * auth or stock rows.
 *   npx tsx scripts/render-brand-stock-preview.tsx <outDir>
 */
import { renderToFile } from '@react-pdf/renderer';
import {
  BrandStockPDF, AllBrandsStockPDF,
  type BrandStockReportData,
} from '@/components/reports/brand-stock-pdf';
import {
  stockStatus, sortForReport, summarize, reorderItems,
  type BrandStockProduct,
} from '@/lib/brand-stock';

const R = (rupees: number) => rupees * 100;

function product(
  name: string, stock: number, threshold: number, unit: string,
  sale: number, cost?: number,
): BrandStockProduct {
  return {
    name,
    stock,
    unit,
    sale_price_paisa: R(sale),
    ...(cost !== undefined ? { purchase_price_paisa: R(cost) } : {}),
    status: stockStatus(stock, threshold),
  };
}

function report(
  name: string,
  type: 'multinational' | 'local_dealer',
  contact: string | null,
  phone: string | null,
  products: BrandStockProduct[],
): BrandStockReportData {
  const sorted = sortForReport(products);
  return {
    brand: { name, brand_type: type, contact_person: contact, phone },
    products: sorted,
    summary: summarize(sorted),
    reorder_items: reorderItems(sorted),
  };
}

const doubleHorse = report('Double Horse', 'multinational', 'Ali Khan', '0301-1234567', [
  product('DH Motor Oil 20W-50', 45, 10, 'can', 2_200, 1_800),
  product('DH Gear Oil 90', 3, 5, 'ltr', 1_800, 1_500),
  product('DH Brake Fluid', 0, 5, 'btl', 950, 700),
  product('DH Coolant 1L', 28, 10, 'btl', 650, 480),
  product('DH ATF Fluid', 12, 5, 'ltr', 1_400, 1_100),
  product('DH Power Steering Fluid', 5, 8, 'btl', 1_150_00 / 100, 900), // Rs 1,150
  // a big price to prove lakh grouping in print
  product('DH Drum 208L', 2, 3, 'drum', 150_000, 120_000),
]);

const raiz = report('Raiz Multan', 'local_dealer', null, '0300-7654321', [
  product('Multi-grade Oil Can', 60, 10, 'can', 1_100, 850),
  product('Local Brake Fluid', 8, 10, 'btl', 400, 250),
]);

async function main() {
  const outDir = process.argv[2] ?? '.';
  await renderToFile(
    <BrandStockPDF
      reports={[doubleHorse]}
      businessName="Khaliq Oil Company"
      showCost
      generatedAt={new Date('2026-08-08T11:30:00Z')}
    />,
    `${outDir}/brand-stock-admin.pdf`,
  );
  // Staff view: cost column absent entirely
  const staffReports = [doubleHorse].map((r) => ({
    ...r,
    products: r.products.map((p) => {
      const { ...rest } = p;
      delete rest.purchase_price_paisa;
      return rest;
    }),
  }));
  await renderToFile(
    <BrandStockPDF
      reports={staffReports}
      businessName="Khaliq Oil Company"
      showCost={false}
      generatedAt={new Date('2026-08-08T11:30:00Z')}
    />,
    `${outDir}/brand-stock-staff.pdf`,
  );
  await renderToFile(
    <AllBrandsStockPDF
      reports={[doubleHorse, raiz]}
      businessName="Khaliq Oil Company"
      showCost
      generatedAt={new Date('2026-08-08T11:30:00Z')}
    />,
    `${outDir}/brand-stock-all.pdf`,
  );
  console.log('rendered brand-stock previews');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
