// What the approval system needs to know about each deletable entity: how to
// find it, how to describe it to an admin who has not opened it, what to warn
// about, and how it is actually deleted.
//
// One place, so adding a new deletable entity is one entry rather than edits
// scattered across the request path, the approval card and the delete button.

import { formatPKR } from '@/lib/money';
import type { DeletableEntity } from '@/lib/validators/deletion-requests';

export type EntityDetail = { label: string; value: string };

export type EntitySnapshot = {
  /** "Invoice #INV-00115" — what the request is titled. */
  displayName: string;
  /** Shown on the approval card so the admin need not open the record. */
  details: EntityDetail[];
  /** "This invoice has Rs. 85,000 in payments recorded." */
  warnings: string[];
  /** Frozen for drift detection; compared at approval time. */
  metadata: Record<string, unknown>;
  /** updated_at, when the table has one — the basis of the drift warning. */
  modifiedAt: string | null;
};

export type EntityConfig = {
  /** The table the row lives in. Used to name it, not to read it. */
  table: string;
  /**
   * Where to READ the row for a preview, when that is not the table itself.
   * products and stock_purchases carry cost prices, so their base tables are
   * closed to staff — and staff are exactly who files these requests. Reading
   * through the _for_role view returns the row with the money columns NULLed,
   * which is all a preview needs.
   */
  readTable?: string;
  label: string;
  /** Columns the snapshot needs, beyond id. */
  columns: string;
  /** Whether the table carries deleted_at, so an already-deleted row is caught. */
  softDeletes: boolean;
  describe: (row: Record<string, unknown>) => Omit<EntitySnapshot, 'modifiedAt'>;
};

const str = (v: unknown): string => String(v ?? '');
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function joinedName(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (!v) return null;
  const obj = Array.isArray(v) ? v[0] : v;
  return (obj as { name?: string })?.name ?? null;
}

export const ENTITY_CONFIG: Record<DeletableEntity, EntityConfig> = {
  invoice: {
    table: 'invoices',
    label: 'Invoice',
    columns: 'id, invoice_number, issue_date, total_paisa, paid_paisa, status, deleted_at, updated_at, customers(name)',
    softDeletes: true,
    describe: (r) => {
      const paid = num(r.paid_paisa);
      return {
        displayName: `Invoice #${str(r.invoice_number)}`,
        details: [
          { label: 'Customer', value: joinedName(r, 'customers') ?? '—' },
          { label: 'Amount', value: formatPKR(num(r.total_paisa)) },
          { label: 'Date', value: str(r.issue_date) },
          { label: 'Status', value: str(r.status) },
        ],
        warnings: paid > 0
          ? [`This invoice has ${formatPKR(paid)} in payments recorded against it.`]
          : [],
        metadata: {
          invoice_number: str(r.invoice_number),
          customer_name: joinedName(r, 'customers'),
          total_paisa: num(r.total_paisa),
          paid_paisa: paid,
          issue_date: str(r.issue_date),
        },
      };
    },
  },

  customer: {
    table: 'customers',
    label: 'Customer',
    columns: 'id, name, phone, opening_balance_paisa, is_defaulter, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Customer "${str(r.name)}"`,
      details: [
        { label: 'Phone', value: str(r.phone) || '—' },
        { label: 'Opening balance', value: formatPKR(num(r.opening_balance_paisa)) },
      ],
      // The live balance needs the ledger, which the snapshot does not read;
      // the approval card fetches it separately so the warning is current.
      warnings: r.is_defaulter ? ['This customer is flagged as a defaulter.'] : [],
      metadata: {
        name: str(r.name),
        phone: str(r.phone),
        opening_balance_paisa: num(r.opening_balance_paisa),
      },
    }),
  },

  product: {
    table: 'products',
    readTable: 'products_for_role',
    label: 'Product',
    columns: 'id, name, sku, unit, sale_price_paisa, brand_id, brand_name, is_active, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Product "${str(r.name)}"`,
      details: [
        { label: 'SKU', value: str(r.sku) || '—' },
        // Either shape: the embedded object when read through the base table,
        // the plain column when read through products_for_role.
        { label: 'Brand', value: joinedName(r, 'brands') ?? (str(r.brand_name) || 'Unbranded') },
        { label: 'Sale price', value: formatPKR(num(r.sale_price_paisa)) },
      ],
      warnings: [],
      metadata: {
        name: str(r.name), sku: str(r.sku),
        brand_name: joinedName(r, 'brands') ?? (str(r.brand_name) || null),
        sale_price_paisa: num(r.sale_price_paisa),
      },
    }),
  },

  expense: {
    table: 'expenses',
    label: 'Expense',
    columns: 'id, category, description, amount_paisa, expense_date, type, asset_name, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Expense "${str(r.category)} ${formatPKR(num(r.amount_paisa))}"`,
      details: [
        { label: 'Category', value: str(r.category) },
        { label: 'Item', value: str(r.asset_name) || '—' },
        { label: 'Amount', value: formatPKR(num(r.amount_paisa)) },
        { label: 'Date', value: str(r.expense_date) },
        { label: 'Note', value: str(r.description) || '—' },
      ],
      warnings: [],
      metadata: {
        category: str(r.category), amount_paisa: num(r.amount_paisa),
        expense_date: str(r.expense_date), description: str(r.description),
      },
    }),
  },

  payment: {
    table: 'payments',
    label: 'Payment',
    columns: 'id, amount_paisa, method, payment_date, invoice_id, deleted_at, updated_at, customers(name)',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Payment ${formatPKR(num(r.amount_paisa))}`,
      details: [
        { label: 'Customer', value: joinedName(r, 'customers') ?? '—' },
        { label: 'Amount', value: formatPKR(num(r.amount_paisa)) },
        { label: 'Method', value: str(r.method) },
        { label: 'Date', value: str(r.payment_date) },
      ],
      warnings: r.invoice_id
        ? ['This payment is attached to an invoice; deleting it does not reverse the ledger entry.']
        : ['Deleting a payment does not reverse the ledger entry.'],
      metadata: {
        amount_paisa: num(r.amount_paisa), method: str(r.method),
        payment_date: str(r.payment_date), customer_name: joinedName(r, 'customers'),
      },
    }),
  },

  return: {
    table: 'returns',
    label: 'Return',
    columns: 'id, return_number, return_date, total_paisa, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Return #${str(r.return_number)}`,
      details: [
        { label: 'Amount', value: formatPKR(num(r.total_paisa)) },
        { label: 'Date', value: str(r.return_date) },
      ],
      warnings: ['Returns have no delete action yet — see the note in resolveDeletionRequest.'],
      metadata: { return_number: str(r.return_number), total_paisa: num(r.total_paisa) },
    }),
  },

  supplier: {
    table: 'suppliers',
    label: 'Supplier',
    columns: 'id, name, phone, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Supplier "${str(r.name)}"`,
      details: [{ label: 'Phone', value: str(r.phone) || '—' }],
      warnings: [],
      metadata: { name: str(r.name), phone: str(r.phone) },
    }),
  },

  stock_purchase: {
    table: 'stock_purchases',
    readTable: 'stock_purchases_for_role',
    label: 'Stock Purchase',
    columns: 'id, quantity, purchase_date, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Stock purchase of ${num(r.quantity)} units`,
      details: [
        { label: 'Quantity', value: String(num(r.quantity)) },
        { label: 'Date', value: str(r.purchase_date) },
      ],
      warnings: ['Stock purchases have no delete action yet.'],
      metadata: { quantity: num(r.quantity), purchase_date: str(r.purchase_date) },
    }),
  },

  supplier_payment: {
    table: 'supplier_payments',
    label: 'Supplier Payment',
    columns: 'id, amount_paisa, payment_date, payment_method, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Supplier payment ${formatPKR(num(r.amount_paisa))}`,
      details: [
        { label: 'Amount', value: formatPKR(num(r.amount_paisa)) },
        { label: 'Date', value: str(r.payment_date) },
      ],
      warnings: ['Supplier payments have no delete action yet.'],
      metadata: { amount_paisa: num(r.amount_paisa), payment_date: str(r.payment_date) },
    }),
  },

  brand: {
    table: 'brands',
    label: 'Brand',
    columns: 'id, name, brand_type, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Brand "${str(r.name)}"`,
      details: [{ label: 'Type', value: str(r.brand_type) }],
      warnings: [],
      metadata: { name: str(r.name), brand_type: str(r.brand_type) },
    }),
  },

  location: {
    table: 'locations',
    label: 'Location',
    columns: 'id, name, short_code, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Location "${str(r.name)}"`,
      details: [{ label: 'Code', value: str(r.short_code) || '—' }],
      warnings: [],
      metadata: { name: str(r.name), short_code: str(r.short_code) },
    }),
  },

  customer_category: {
    table: 'customer_categories',
    label: 'Customer Category',
    columns: 'id, name, description, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Customer category "${str(r.name)}"`,
      details: [{ label: 'Description', value: str(r.description) || '—' }],
      warnings: [],
      metadata: { name: str(r.name) },
    }),
  },

  expense_asset: {
    table: 'expense_assets',
    label: 'Expense Item',
    columns: 'id, name, category, asset_type, deleted_at, updated_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Expense item "${str(r.name)}"`,
      details: [
        { label: 'Category', value: str(r.category) },
        { label: 'Type', value: str(r.asset_type) || '—' },
      ],
      warnings: [],
      metadata: { name: str(r.name), category: str(r.category) },
    }),
  },

  expense_sub_type: {
    table: 'expense_sub_types',
    label: 'Expense Type',
    columns: 'id, name, category, deleted_at',
    softDeletes: true,
    describe: (r) => ({
      displayName: `Expense type "${str(r.name)}"`,
      details: [{ label: 'Category', value: str(r.category) }],
      warnings: [],
      metadata: { name: str(r.name), category: str(r.category) },
    }),
  },
};

/**
 * Entities the approval flow can describe but cannot yet execute, because the
 * app has no delete action for them. Approving one of these is refused rather
 * than silently marking the request done and leaving the row in place.
 */
export const NO_DELETE_ACTION: readonly DeletableEntity[] = [
  'return', 'stock_purchase', 'supplier_payment',
];

/** Compares the snapshot with the row as it stands now. */
export function describeDrift(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const drift: string[] = [];
  for (const key of Object.keys(before)) {
    const a = before[key];
    const b = after[key];
    if (a === null && b === null) continue;
    if (String(a ?? '') !== String(b ?? '')) {
      drift.push(`${key}: ${String(a ?? '—')} → ${String(b ?? '—')}`);
    }
  }
  return drift;
}
