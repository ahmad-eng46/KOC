import { formatInTimeZone } from 'date-fns-tz';
import type {
  CustomerRow, CustomerStats, ExpenseRow, InvoiceRow, PaymentRow, ProductRow,
  SupplierRow, SupplierStats,
} from '@/lib/backup/dataset';

/**
 * The Summary sheet's numbers, computed in one pure pass so they are unit
 * testable and so the sheet builder only has to lay them out.
 *
 * Every figure is all-time or a fixed named period — never the chosen export
 * range. A one-page business overview that silently meant "this month" would
 * be worse than no overview.
 */

const KARACHI = 'Asia/Karachi';

export type SummaryLine =
  | { kind: 'money'; label: string; paisa: number }
  | { kind: 'count'; label: string; count: number }
  | { kind: 'text'; label: string; text: string };

export type SummaryBlock = { title: string; lines: SummaryLine[] };

export type SummaryInput = {
  invoices: InvoiceRow[];
  customers: CustomerRow[];
  customerStats: Map<string, CustomerStats>;
  payments: PaymentRow[];
  expenses: ExpenseRow[];
  products: ProductRow[];
  stockByProduct: Map<string, number>;
  suppliers: SupplierRow[];
  supplierStats: Map<string, SupplierStats>;
  showCost: boolean;
};

function karachiDay(d: Date): string {
  return formatInTimeZone(d, KARACHI, 'yyyy-MM-dd');
}

/** First day of the Karachi month `now` falls in. */
export function monthStartDay(now: Date): string {
  return `${formatInTimeZone(now, KARACHI, 'yyyy-MM')}-01`;
}

/** Inclusive start of the trailing 30-day window ending today. */
export function last30StartDay(now: Date): string {
  return karachiDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Draft invoices are excluded everywhere: they post no ledger entry, so
 * counting them would make the summary disagree with every customer balance.
 */
function isCounted(inv: InvoiceRow): boolean {
  return inv.status !== 'draft';
}

export function buildSummary(input: SummaryInput, now: Date): SummaryBlock[] {
  const monthStart = monthStartDay(now);
  const last30Start = last30StartDay(now);

  const invoices = input.invoices.filter(isCounted);
  const salesAll = sum(invoices.map((i) => i.total_paisa));
  const salesMonth = sum(invoices.filter((i) => i.issue_date >= monthStart).map((i) => i.total_paisa));
  const salesLast30 = sum(invoices.filter((i) => i.issue_date >= last30Start).map((i) => i.total_paisa));
  const avgInvoice = invoices.length === 0 ? 0 : Math.round(salesAll / invoices.length);

  const livePayments = input.payments.filter((p) => p.deleted_at === null);
  const paidAll = sum(livePayments.map((p) => p.amount_paisa));

  const balances = input.customers.map((c) => input.customerStats.get(c.id)?.balance ?? 0);
  const receivables = sum(balances.filter((b) => b > 0));
  const withDues = balances.filter((b) => b > 0).length;

  const expensesAll = sum(input.expenses.map((e) => e.amount_paisa));
  const expensesMonth = sum(
    input.expenses.filter((e) => e.expense_date >= monthStart).map((e) => e.amount_paisa),
  );

  const byCategory = new Map<string, number>();
  for (const e of input.expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount_paisa);
  }
  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const onHand = (p: ProductRow): number => Math.max(input.stockByProduct.get(p.id) ?? 0, 0);
  const stockValueSale = sum(input.products.map((p) => Math.round(onHand(p) * p.sale_price_paisa)));
  const stockValueCost = sum(input.products.map((p) => Math.round(onHand(p) * p.purchase_price_paisa)));
  const outOfStock = input.products.filter((p) => (input.stockByProduct.get(p.id) ?? 0) <= 0).length;
  const lowStock = input.products.filter((p) => {
    const qty = input.stockByProduct.get(p.id) ?? 0;
    return qty > 0 && p.low_stock_threshold > 0 && qty <= p.low_stock_threshold;
  }).length;

  const supplierTotals = input.suppliers.map(
    (s) => input.supplierStats.get(s.id) ?? { purchased: 0, paid: 0, balance: 0 },
  );

  const sales: SummaryBlock = {
    title: 'SALES',
    lines: [
      { kind: 'money', label: 'Total Sales (All Time)', paisa: salesAll },
      { kind: 'money', label: 'Total Sales (This Month)', paisa: salesMonth },
      { kind: 'money', label: 'Total Sales (Last 30 Days)', paisa: salesLast30 },
      { kind: 'count', label: 'Total Invoices', count: invoices.length },
      { kind: 'money', label: 'Average Invoice Value', paisa: avgInvoice },
    ],
  };

  const collections: SummaryBlock = {
    title: 'COLLECTIONS',
    lines: [
      { kind: 'money', label: 'Total Payments Received', paisa: paidAll },
      { kind: 'money', label: 'Outstanding Receivables', paisa: receivables },
      {
        kind: 'text',
        label: 'Customers with Dues',
        text: `${withDues} of ${input.customers.length}`,
      },
    ],
  };

  const expenses: SummaryBlock = {
    title: 'EXPENSES',
    lines: [
      { kind: 'money', label: 'Total Expenses (All Time)', paisa: expensesAll },
      { kind: 'money', label: 'Total Expenses (This Month)', paisa: expensesMonth },
      ...topCategories.map(([category, paisa]): SummaryLine => ({
        kind: 'money', label: `Top Category: ${category}`, paisa,
      })),
    ],
  };

  const stock: SummaryBlock = {
    title: 'STOCK',
    lines: [
      { kind: 'count', label: 'Total Products', count: input.products.length },
      { kind: 'money', label: 'Total Stock Value (Sale)', paisa: stockValueSale },
      ...(input.showCost
        ? [{ kind: 'money' as const, label: 'Total Stock Value (Cost)', paisa: stockValueCost }]
        : []),
      { kind: 'count', label: 'Low Stock Items', count: lowStock },
      { kind: 'count', label: 'Out of Stock Items', count: outOfStock },
    ],
  };

  // Purchase amounts are cost data: staff and viewer get the supplier count
  // and nothing else (iron rule #3).
  const suppliers: SummaryBlock = {
    title: 'SUPPLIERS',
    lines: [
      { kind: 'count', label: 'Total Suppliers', count: input.suppliers.length },
      ...(input.showCost
        ? [
          { kind: 'money' as const, label: 'Total Purchased', paisa: sum(supplierTotals.map((s) => s.purchased)) },
          { kind: 'money' as const, label: 'Total Paid to Suppliers', paisa: sum(supplierTotals.map((s) => s.paid)) },
          {
            kind: 'money' as const,
            label: 'Outstanding to Suppliers',
            paisa: sum(supplierTotals.map((s) => Math.max(s.balance, 0))),
          },
        ]
        : []),
    ],
  };

  return [sales, collections, expenses, stock, suppliers];
}
