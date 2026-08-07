'use server';

import { renderToBuffer } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { getSession } from '@/lib/auth/session';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveBusinessId } from '@/lib/business';
import { formatKarachi, toKarachiExcelDate } from '@/lib/date';
import {
  stockStatus, sortForReport, summarize, reorderItems,
  STATUS_LABELS,
  type BrandStockProduct,
} from '@/lib/brand-stock';
import {
  BrandStockPDF, AllBrandsStockPDF,
  type BrandStockReportData,
} from '@/components/reports/brand-stock-pdf';
import type { BrandType } from '@/lib/validators/brands';

type ExportResult =
  | { ok: true; base64: string; filename: string }
  | { ok: false; error: string };

type FetchResult = {
  reports: BrandStockReportData[];
  businessName: string;
  showCost: boolean;
};

/**
 * Builds the report data with the caller's own auth context:
 *  - products come from products_for_role, so purchase_price_paisa is
 *    ALREADY NULL for staff/viewer (iron rule #3 at the database) — the
 *    column is then omitted from the payload entirely for those roles.
 *  - stock comes from current_stock, the app's single stock computation.
 */
async function fetchBrandStockData(brandId?: string): Promise<FetchResult> {
  const session = await getSession();
  if (!session) throw new Error('Not signed in.');
  const showCost = session.role === 'admin' || session.role === 'accountant';

  const supabase = await createServerClient();
  const businessId = await getActiveBusinessId();

  let brandsQuery = supabase
    .from('brands')
    .select('id, name, brand_type, contact_person, phone')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name');
  if (brandId) brandsQuery = brandsQuery.eq('id', brandId);

  const [brandsRes, productsRes, stockRes, bizRes] = await Promise.all([
    brandsQuery,
    supabase
      .from('products_for_role')
      .select('id, name, unit, sale_price_paisa, purchase_price_paisa, low_stock_threshold, brand_id, is_active')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .not('brand_id', 'is', null),
    supabase
      .from('current_stock')
      .select('product_id, quantity_on_hand')
      .eq('business_id', businessId),
    supabase.from('businesses').select('name').eq('id', businessId).single(),
  ]);
  if (brandsRes.error) throw brandsRes.error;
  if (productsRes.error) throw productsRes.error;
  if (stockRes.error) throw stockRes.error;

  if (brandId && (brandsRes.data ?? []).length === 0) {
    throw new Error('Brand not found.');
  }

  const stockMap = new Map(
    (stockRes.data ?? []).map((r) => [r.product_id as string, Number(r.quantity_on_hand)]),
  );

  const reports: BrandStockReportData[] = (brandsRes.data ?? []).map((b) => {
    const products: BrandStockProduct[] = sortForReport(
      (productsRes.data ?? [])
        .filter((p) => p.brand_id === b.id)
        .map((p) => {
          const stock = stockMap.get(p.id as string) ?? 0;
          const row: BrandStockProduct = {
            name: p.name as string,
            stock,
            unit: p.unit as string,
            sale_price_paisa: Number(p.sale_price_paisa),
            status: stockStatus(stock, p.low_stock_threshold as number | null),
          };
          // Column absent — not zeroed, not dashed — for staff/viewer.
          if (showCost && p.purchase_price_paisa != null) {
            row.purchase_price_paisa = Number(p.purchase_price_paisa);
          }
          return row;
        }),
    );
    return {
      brand: {
        name: b.name as string,
        brand_type: b.brand_type as BrandType,
        contact_person: (b.contact_person as string | null) ?? null,
        phone: (b.phone as string | null) ?? null,
      },
      products,
      summary: summarize(products),
      reorder_items: reorderItems(products),
    };
  });

  return { reports, businessName: bizRes.data?.name ?? 'Business', showCost };
}

/** Spec-named accessors (also used by the export actions below). */
export async function getBrandStockReport(brandId: string): Promise<BrandStockReportData> {
  const { reports } = await fetchBrandStockData(brandId);
  return reports[0];
}

export async function getBrandStockReportAll(): Promise<BrandStockReportData[]> {
  const { reports } = await fetchBrandStockData();
  return reports;
}

function slug(name: string): string {
  return name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase() || 'brand';
}

export async function exportBrandStockPdf(brandId?: string): Promise<ExportResult> {
  try {
    const now = new Date();
    const { reports, businessName, showCost } = await fetchBrandStockData(brandId);
    const doc = brandId ? (
      <BrandStockPDF reports={reports} businessName={businessName} showCost={showCost} generatedAt={now} />
    ) : (
      <AllBrandsStockPDF reports={reports} businessName={businessName} showCost={showCost} generatedAt={now} />
    );
    const buf = await renderToBuffer(doc);
    const base = brandId ? `stock-${slug(reports[0].brand.name)}` : 'stock-all-brands';
    return {
      ok: true,
      base64: Buffer.from(buf).toString('base64'),
      filename: `${base}-${format(now, 'yyyy-MM-dd')}.pdf`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const STATUS_FILL: Record<string, string> = {
  stocked: 'FFDCFCE7',      // green
  low: 'FFFEF9C3',          // yellow
  out_of_stock: 'FFFECACA', // red
};

function addBrandSheets(
  wb: ExcelJS.Workbook,
  data: BrandStockReportData,
  opts: { showCost: boolean; sheetName?: string; generatedAt: Date; businessName: string },
) {
  const name = (opts.sheetName ?? 'Stock Report')
    .replace(/[\\/?*[\]:]/g, ' ')
    .slice(0, 31)
    .trim();
  const ws = wb.addWorksheet(name);

  ws.addRow([opts.businessName]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([`Stock Report — ${data.brand.name}`]);
  ws.getRow(2).font = { bold: true };
  ws.addRow([`Generated: ${formatKarachi(opts.generatedAt, 'dd MMM yyyy, h:mm a')} PKT`]);
  if (data.brand.contact_person || data.brand.phone) {
    ws.addRow([`Contact: ${[data.brand.contact_person, data.brand.phone].filter(Boolean).join(' · ')}`]);
  }
  ws.addRow([]);

  const headers = ['#', 'Product', 'Stock', 'Unit', 'Sale Price', ...(opts.showCost ? ['Purchase Price'] : []), 'Status'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });

  data.products.forEach((p, i) => {
    const row = ws.addRow([
      i + 1,
      p.name,
      p.stock,
      p.unit,
      p.sale_price_paisa / 100,
      ...(opts.showCost ? [p.purchase_price_paisa != null ? p.purchase_price_paisa / 100 : ''] : []),
      STATUS_LABELS[p.status],
    ]);
    const statusCell = row.getCell(headers.length);
    statusCell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: STATUS_FILL[p.status] },
    };
  });

  ws.addRow([]);
  const summaryRows: Array<[string, number]> = [
    ['Total Products', data.summary.total_products],
    ['Total Stock', data.summary.total_stock],
    ['Low Stock Items', data.summary.low_stock_count],
    ['Out of Stock', data.summary.out_of_stock_count],
  ];
  for (const [label, value] of summaryRows) {
    const r = ws.addRow(['', label, value]);
    r.getCell(2).font = { bold: true };
  }

  ws.columns.forEach((c, i) => {
    c.width = i === 1 ? 34 : 14;
  });

  return ws;
}

function addReorderSheet(wb: ExcelJS.Workbook, reports: BrandStockReportData[]) {
  const ws = wb.addWorksheet('Reorder List');
  const header = ws.addRow(['Brand', 'Product', 'Current Stock', 'Status']);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  });
  for (const r of reports) {
    for (const item of r.reorder_items) {
      const row = ws.addRow([
        r.brand.name,
        item.name,
        item.current_stock,
        STATUS_LABELS[item.status],
      ]);
      row.getCell(4).fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: STATUS_FILL[item.status] },
      };
    }
  }
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 34 : 18; });
}

export async function exportBrandStockExcel(brandId?: string): Promise<ExportResult> {
  try {
    const now = new Date();
    const { reports, businessName, showCost } = await fetchBrandStockData(brandId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'KOC';
    wb.created = toKarachiExcelDate(now);

    if (brandId) {
      addBrandSheets(wb, reports[0], { showCost, generatedAt: now, businessName });
      addReorderSheet(wb, reports);
    } else {
      const ws = wb.addWorksheet('Summary');
      const header = ws.addRow(['Brand', 'Products', 'In Stock', 'Low', 'Out of Stock']);
      header.font = { bold: true };
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      });
      for (const r of reports) {
        ws.addRow([
          r.brand.name,
          r.summary.total_products,
          r.summary.total_stock,
          r.summary.low_stock_count,
          r.summary.out_of_stock_count,
        ]);
      }
      ws.columns.forEach((c, i) => { c.width = i === 0 ? 30 : 14; });

      const used = new Set<string>(['Summary', 'Reorder List']);
      for (const r of reports) {
        let name = r.brand.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Brand';
        let n = 2;
        const base = name;
        while (used.has(name)) name = `${base} ${n++}`;
        used.add(name);
        addBrandSheets(wb, r, { showCost, sheetName: name, generatedAt: now, businessName });
      }
      addReorderSheet(wb, reports);
    }

    const buf = await wb.xlsx.writeBuffer();
    const base = brandId ? `stock-${slug(reports[0].brand.name)}` : 'stock-all-brands';
    return {
      ok: true,
      base64: Buffer.from(buf).toString('base64'),
      filename: `${base}-${format(now, 'yyyy-MM-dd')}.xlsx`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
