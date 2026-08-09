import type ExcelJS from 'exceljs';
import { formatKarachi } from '@/lib/date';
import type { BackupDataset } from '@/lib/backup/dataset';
import { buildSummary, type SummaryBlock } from '@/lib/backup/summary';
import { INT_FMT, TAB, THEME, writeMoney } from '@/lib/backup/xlsx-style';

/**
 * The one page an owner or his accountant can read on its own: sales,
 * collections, expenses, stock and suppliers, each as a labelled block of
 * figures rather than a table.
 */

export const SUMMARY_SHEET_NAME = 'Summary';

const LABEL_COL = 2;
const VALUE_COL = 3;

export function addSummarySheet(
  wb: ExcelJS.Workbook,
  data: BackupDataset,
  now: Date,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SUMMARY_SHEET_NAME);
  ws.properties.tabColor = { argb: TAB.summary };
  ws.getColumn(1).width = 3;
  ws.getColumn(LABEL_COL).width = 36;
  ws.getColumn(VALUE_COL).width = 24;

  const title = ws.getCell(2, LABEL_COL);
  title.value = `BUSINESS SUMMARY — ${data.businessName.toUpperCase()}`;
  title.font = { bold: true, size: 14, color: { argb: THEME.headerFill } };

  const generated = ws.getCell(3, LABEL_COL);
  generated.value = `Generated: ${formatKarachi(now, 'dd MMM yyyy')}`;
  generated.font = { color: { argb: THEME.idFont } };

  let row = 5;
  for (const block of buildSummary(data, now)) {
    row = writeBlock(ws, block, row);
    row += 1;
  }

  const note = ws.getCell(row + 1, LABEL_COL);
  note.value =
    'Figures are all-time or the named period, in Pakistani rupees. '
    + 'Balances use the same ledger the app displays.';
  note.font = { italic: true, size: 9, color: { argb: THEME.idFont } };

  ws.views = [{ state: 'frozen', ySplit: 3 }];
  return ws;
}

function writeBlock(ws: ExcelJS.Worksheet, block: SummaryBlock, startRow: number): number {
  const heading = ws.getCell(startRow, LABEL_COL);
  heading.value = block.title;
  heading.font = { bold: true, size: 11, color: { argb: THEME.headerFill } };
  heading.border = { bottom: { style: 'thin', color: { argb: THEME.border } } };
  ws.getCell(startRow, VALUE_COL).border = {
    bottom: { style: 'thin', color: { argb: THEME.border } },
  };

  let row = startRow + 1;
  for (const line of block.lines) {
    ws.getCell(row, LABEL_COL).value = `  ${line.label}`;
    const value = ws.getCell(row, VALUE_COL);
    if (line.kind === 'money') {
      writeMoney(value, line.paisa);
    } else if (line.kind === 'count') {
      value.value = line.count;
      value.numFmt = INT_FMT;
      value.alignment = { horizontal: 'right' };
    } else {
      value.value = line.text;
      value.alignment = { horizontal: 'right' };
    }
    row += 1;
  }
  return row;
}
