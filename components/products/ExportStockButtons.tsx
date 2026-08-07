'use client';

import { ExportButtons } from '@/components/reports/shared';
import { exportBrandStockPdf, exportBrandStockExcel } from '@/lib/actions/brand-stock-report';
import type { BrandSummary } from '@/lib/queries/brands';

type Props = {
  /** The brand whose stock to export; null when a non-exportable view is active. */
  activeBrand: BrandSummary | null;
  /** "All" view → export everything grouped by brand. */
  isAll: boolean;
};

/**
 * Per-brand stock report exports — the sheet the owner hands to a supplier
 * rep. Hidden on the Unbranded view (there is no supplier to send it to).
 */
export function ExportStockButtons({ activeBrand, isAll }: Props) {
  if (!activeBrand && !isAll) return null;
  const brandId = activeBrand?.id;
  return (
    <ExportButtons
      onExportPdf={() => exportBrandStockPdf(brandId)}
      onExportExcel={() => exportBrandStockExcel(brandId)}
    />
  );
}
