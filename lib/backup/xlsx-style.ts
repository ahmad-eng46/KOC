import type ExcelJS from 'exceljs';
import { toKarachiExcelDate } from '@/lib/date';

/**
 * The workbook's visual language, in one place: colours, number formats and
 * the primitives that write a typed value into a cell.
 *
 * Money is written as a *number* in rupees, never as pre-formatted text — the
 * accountant has to be able to select a column and see a sum. The Pakistani
 * grouping comes from the number format, not from the value.
 */

export const THEME = {
  headerFill: 'FF1F3B63',
  headerFont: 'FFFFFFFF',
  totalFill: 'FFE8EDF4',
  bandFill: 'FFF7F9FC',
  idFill: 'FFF3F4F6',
  idFont: 'FF9CA3AF',
  redFill: 'FFFCE4E4',
  redFont: 'FF9B1C1C',
  greenFill: 'FFE4F6EA',
  greenFont: 'FF15803D',
  amberFill: 'FFFFF3D6',
  amberFont: 'FF92400E',
  border: 'FFD8DEE8',
} as const;

/** Sheet tab colours: data blue, summary green, reference grey. */
export const TAB = {
  summary: 'FF15803D',
  data: 'FF1F3B63',
  reference: 'FF6B7280',
} as const;

export type TabColor = (typeof TAB)[keyof typeof TAB];

/**
 * Pakistani digit grouping — 1,50,000.00 rather than 150,000.00.
 *
 * Excel cannot express lakh grouping in one mask: the separators are literal
 * text, so the mask has to match the magnitude of the value it renders. One
 * format per bucket, chosen per cell, is exact for every number; the usual
 * three-section conditional format leaves the leading group empty and is only
 * correct inside its own band. The second section keeps the minus sign after
 * "Rs. " instead of Excel's default "-Rs. 5.00".
 */
const MONEY_UNDER_LAKH = '"Rs. "#,##0.00;"Rs. -"#,##0.00';
const MONEY_LAKH = '"Rs. "#\\,##\\,##0.00;"Rs. -"#\\,##\\,##0.00';
const MONEY_CRORE = '"Rs. "#\\,##\\,##\\,##0.00;"Rs. -"#\\,##\\,##\\,##0.00';

export const QTY_FMT = '#,##0.###';
export const INT_FMT = '#,##0';
export const DATE_FMT = 'dd mmm yyyy';
export const DATETIME_FMT = 'dd mmm yyyy  hh:mm AM/PM';

export function moneyFormat(rupees: number): string {
  const abs = Math.abs(rupees);
  if (abs >= 1e7) return MONEY_CRORE;
  if (abs >= 1e5) return MONEY_LAKH;
  return MONEY_UNDER_LAKH;
}

/** Writes integer paisa as a right-aligned rupee number. */
export function writeMoney(cell: ExcelJS.Cell, paisa: number | null): void {
  if (paisa === null) {
    cell.value = '—';
    cell.alignment = { horizontal: 'right' };
    return;
  }
  const rupees = paisa / 100;
  cell.value = rupees;
  cell.numFmt = moneyFormat(rupees);
  cell.alignment = { horizontal: 'right' };
}

/** A DATE column ('2026-08-09') — no timezone conversion to get wrong. */
export function writeDate(cell: ExcelJS.Cell, isoDay: string | null): void {
  if (!isoDay) {
    cell.value = '—';
    return;
  }
  const [y, m, d] = isoDay.split('-').map(Number);
  cell.value = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  cell.numFmt = DATE_FMT;
  cell.alignment = { horizontal: 'left' };
}

/** A TIMESTAMPTZ, shown as Karachi wall-clock. */
export function writeDateTime(cell: ExcelJS.Cell, iso: string | null): void {
  if (!iso) {
    cell.value = '—';
    return;
  }
  cell.value = toKarachiExcelDate(iso);
  cell.numFmt = DATETIME_FMT;
  cell.alignment = { horizontal: 'left' };
}

export function fill(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** Red when money is owed, green when it is square or in credit. */
export function paintBalance(cell: ExcelJS.Cell, paisa: number): void {
  const owed = paisa > 0;
  fill(cell, owed ? THEME.redFill : THEME.greenFill);
  cell.font = { color: { argb: owed ? THEME.redFont : THEME.greenFont }, bold: true };
}

export function paintStatus(cell: ExcelJS.Cell, tone: 'good' | 'bad' | 'warn' | 'none'): void {
  if (tone === 'none') return;
  const map = {
    good: [THEME.greenFill, THEME.greenFont],
    bad: [THEME.redFill, THEME.redFont],
    warn: [THEME.amberFill, THEME.amberFont],
  } as const;
  const [bg, fg] = map[tone];
  fill(cell, bg);
  cell.font = { color: { argb: fg }, bold: true };
}

/**
 * Landscape, scaled to one page wide with the header repeated on every sheet
 * of paper. The owner prints these and takes them to his accountant; a table
 * that spills its last three columns onto a second stack of pages is not a
 * report.
 */
export function applyPrintSetup(ws: ExcelJS.Worksheet, businessName: string): void {
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3,
    },
    printTitlesRow: '1:1',
  };
  ws.headerFooter = {
    oddFooter: `&L${businessName} — ${ws.name}&R Page &P of &N`,
    evenFooter: `&L${businessName} — ${ws.name}&R Page &P of &N`,
  };
}

const WIDTH_MIN = 10;
const WIDTH_MAX = 46;

/**
 * Column widths from rendered content. Dates and money are measured by the
 * width their *format* produces, not by the serial number underneath.
 */
export function autoSizeColumns(ws: ExcelJS.Worksheet): void {
  ws.columns.forEach((col) => {
    let widest = 0;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      let len: number;
      if (v instanceof Date) len = DATETIME_FMT.length;
      // A money serial renders as "Rs. " + grouped digits + ".00".
      else if (typeof v === 'number') len = String(Math.round(Math.abs(v))).length + 9;
      else len = v == null ? 0 : String(v).length;
      if (len > widest) widest = len;
    });
    col.width = Math.min(Math.max(widest + 2, WIDTH_MIN), WIDTH_MAX);
  });
}
