import type ExcelJS from 'exceljs';
import {
  INT_FMT, QTY_FMT, THEME, autoSizeColumns, fill,
  writeDate, writeDateTime, writeMoney, type TabColor,
} from '@/lib/backup/xlsx-style';

/**
 * One way to write a table, so every data sheet in the workbook looks and
 * behaves the same: styled frozen header, auto-filter, typed cells, optional
 * totals row.
 *
 * A column's `value` returns the raw figure for its kind — integer paisa for
 * money, a YYYY-MM-DD day for dates, an ISO timestamp for datetimes — and the
 * writer decides how it is rendered. Sheet builders never touch a number
 * format.
 */

export type CellKind = 'text' | 'money' | 'qty' | 'int' | 'date' | 'datetime' | 'id';

export type SheetColumn<T> = {
  header: string;
  kind?: CellKind;
  value: (row: T, index: number) => string | number | null;
  /** Summed into the totals row. Money and quantity columns only. */
  total?: boolean;
  /** Runs after the value is written, for conditional colour. */
  paint?: (cell: ExcelJS.Cell, row: T) => void;
  width?: number;
};

export type SheetSpec<T> = {
  name: string;
  tab: TabColor;
  rows: T[];
  /** `null` entries are dropped, which is how role-gated columns disappear. */
  columns: Array<SheetColumn<T> | null>;
  totals?: boolean;
  /** Printed under the header when there are no rows. */
  emptyNote?: string;
};

export function addSheet<T>(wb: ExcelJS.Workbook, spec: SheetSpec<T>): ExcelJS.Worksheet {
  const columns = spec.columns.filter((c): c is SheetColumn<T> => c !== null);
  const ws = wb.addWorksheet(spec.name);
  ws.properties.tabColor = { argb: spec.tab };

  const header = ws.getRow(1);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: THEME.headerFont } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    fill(cell, THEME.headerFill);
  });
  header.height = 22;
  header.commit();

  spec.rows.forEach((row, index) => {
    const excelRow = ws.getRow(index + 2);
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      writeCell(cell, col.kind ?? 'text', col.value(row, index));
      col.paint?.(cell, row);
    });
    excelRow.commit();
  });

  if (spec.rows.length === 0 && spec.emptyNote) {
    const cell = ws.getRow(2).getCell(1);
    cell.value = spec.emptyNote;
    cell.font = { italic: true, color: { argb: THEME.idFont } };
  }

  if (spec.totals && spec.rows.length > 0) addTotalsRow(ws, spec.rows, columns);

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  autoSizeColumns(ws);
  columns.forEach((col, i) => {
    if (col.width) ws.getColumn(i + 1).width = col.width;
  });

  return ws;
}

function writeCell(cell: ExcelJS.Cell, kind: CellKind, raw: string | number | null): void {
  switch (kind) {
    case 'money':
      writeMoney(cell, typeof raw === 'number' ? raw : null);
      return;
    case 'qty':
      cell.value = typeof raw === 'number' ? raw : '—';
      if (typeof raw === 'number') cell.numFmt = QTY_FMT;
      cell.alignment = { horizontal: 'right' };
      return;
    case 'int':
      cell.value = typeof raw === 'number' ? raw : '—';
      if (typeof raw === 'number') cell.numFmt = INT_FMT;
      cell.alignment = { horizontal: 'right' };
      return;
    case 'date':
      writeDate(cell, typeof raw === 'string' ? raw : null);
      return;
    case 'datetime':
      writeDateTime(cell, typeof raw === 'string' ? raw : null);
      return;
    case 'id':
      cell.value = raw ?? '';
      cell.font = { color: { argb: THEME.idFont }, size: 9 };
      fill(cell, THEME.idFill);
      return;
    default:
      cell.value = raw ?? '—';
  }
}

/** Bold banded row summing every column the spec marked `total`. */
function addTotalsRow<T>(
  ws: ExcelJS.Worksheet,
  rows: T[],
  columns: Array<SheetColumn<T>>,
): void {
  const rowNumber = rows.length + 2;
  const totalsRow = ws.getRow(rowNumber);

  let labelled = false;
  columns.forEach((col, i) => {
    const cell = totalsRow.getCell(i + 1);
    fill(cell, THEME.totalFill);
    cell.font = { bold: true };

    if (!col.total) {
      if (!labelled) {
        cell.value = 'TOTAL';
        labelled = true;
      }
      return;
    }

    const sum = rows.reduce((acc, row, index) => {
      const v = col.value(row, index);
      return typeof v === 'number' ? acc + v : acc;
    }, 0);

    if (col.kind === 'money') {
      writeMoney(cell, sum);
    } else {
      cell.value = sum;
      cell.numFmt = col.kind === 'int' ? INT_FMT : QTY_FMT;
      cell.alignment = { horizontal: 'right' };
    }
    cell.font = { bold: true };
  });

  totalsRow.commit();
}
