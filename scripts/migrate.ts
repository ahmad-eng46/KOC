/**
 * Piece 13 — Legacy data migrator.
 *
 *   pnpm migrate              dry-run (default)
 *   pnpm migrate --dry-run    explicit dry-run
 *   pnpm migrate --confirm    actually write to Supabase
 *
 * Reads CSVs from migration_data/ produced by exporting the legacy SQL Server
 * .mdf tables. Writes a markdown report to migration_report.md and stdout.
 *
 * Run on a fresh Supabase project FIRST. Never --confirm against production
 * until a dry-run report has been reviewed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fromZonedTime } from 'date-fns-tz';
import { randomUUID, randomBytes } from 'node:crypto';

const KARACHI = 'Asia/Karachi';
// pnpm always invokes from the package root, so cwd is reliable.
const ROOT = process.cwd();
const CSV_DIR = join(ROOT, 'migration_data');
const REPORT_PATH = join(ROOT, 'migration_report.md');
const LEGACY_BUSINESS_NAME = 'Legacy';

const REQUIRED_FILES = [
  'Customer_Table.csv',
  'Product.csv',
  'Stock_Table.csv',
  'Invoice_Table.csv',
  'Invoice_Table1.csv',
  'Cash_Table.csv',
  'Expense_Table.csv',
  'Investment_Table.csv',
  'Loan_Table.csv',
  'Login.csv',
] as const;

type Row = Record<string, string>;
type Skipped = { table: string; legacyId: string; reason: string };
type Anomaly = { table: string; legacyId: string; note: string };

interface ParsedData {
  customers: Row[];
  products: Row[];
  stock: Row[];
  invoices: Row[];
  invoiceItems: Row[];
  cash: Row[];
  expenses: Row[];
  investments: Row[];
  loans: Row[];
  logins: Row[];
}

interface PlannedCustomer {
  id: string;
  legacyId: string;
  name: string;
  phone: string | null;
  address: string | null;
  openingBalancePaisa: number;
  createdAtUtc: string | null;
}

interface PlannedProduct {
  id: string;
  legacyId: string;
  name: string;
  sku: string | null;
  unit: string;
  salePricePaisa: number;
  purchasePricePaisa: number;
  initialStock: number;
}

interface PlannedStockMovement {
  id: string;
  legacyId: string;
  productId: string;
  quantity: number;
  note: string | null;
  createdAtUtc: string;
}

interface PlannedInvoice {
  id: string;
  legacyId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  subtotalPaisa: number;
  discountPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  notes: string | null;
  createdAtUtc: string;
  status: 'paid' | 'partially_paid' | 'issued';
}

interface PlannedInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: number;
  unitPricePaisa: number;
  purchasePriceAtSalePaisa: number;
  lineTotalPaisa: number;
}

interface PlannedPayment {
  id: string;
  legacyId: string;
  customerId: string;
  invoiceId: string | null;
  amountPaisa: number;
  method: 'cash' | 'bank_transfer' | 'cheque' | 'online';
  reference: string | null;
  paymentDate: string;
  notes: string | null;
  createdAtUtc: string;
}

interface PlannedExpense {
  id: string;
  legacyId: string;
  category: string;
  description: string | null;
  amountPaisa: number;
  expenseDate: string;
  createdAtUtc: string;
}

interface PlannedInvestment {
  id: string;
  legacyId: string;
  investorName: string;
  amountPaisa: number;
  investmentDate: string;
  notes: string | null;
}

interface PlannedLoan {
  id: string;
  legacyId: string;
  partyName: string;
  direction: 'given' | 'taken';
  principalPaisa: number;
  loanDate: string;
  dueDate: string | null;
  isSettled: boolean;
  notes: string | null;
}

interface PlannedUser {
  legacyId: string;
  email: string;
  password: string;
  passwordWasGenerated: boolean;
  fullName: string;
  role: 'admin' | 'accountant' | 'staff' | 'viewer';
}

interface Plan {
  legacyBusiness: { id: string; name: string };
  customers: PlannedCustomer[];
  products: PlannedProduct[];
  stockMovements: PlannedStockMovement[];
  invoices: PlannedInvoice[];
  invoiceItems: PlannedInvoiceItem[];
  payments: PlannedPayment[];
  expenses: PlannedExpense[];
  investments: PlannedInvestment[];
  loans: PlannedLoan[];
  users: PlannedUser[];
  skipped: Skipped[];
  anomalies: Anomaly[];
}

// ---------- argv ----------

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const confirm = args.has('--confirm');
  const dryRun = args.has('--dry-run') || !confirm;
  if (confirm && args.has('--dry-run')) {
    throw new Error('Pass either --dry-run or --confirm, not both.');
  }
  return { dryRun, confirm };
}

// ---------- CSV loading ----------

function loadCsv(filename: string): Row[] {
  const path = join(CSV_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`Missing CSV: ${filename} (expected at ${path})`);
  }
  const raw = readFileSync(path, 'utf-8');
  const records = parse(raw, {
    columns: (headers: string[]) => headers.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  }) as Row[];
  // Lowercase-key copy so column lookups are case-insensitive.
  return records.map((r) => {
    const out: Row = {};
    for (const k of Object.keys(r)) out[k.toLowerCase()] = r[k];
    return out;
  });
}

function loadAll(): ParsedData {
  return {
    customers: loadCsv('Customer_Table.csv'),
    products: loadCsv('Product.csv'),
    stock: loadCsv('Stock_Table.csv'),
    invoices: loadCsv('Invoice_Table.csv'),
    invoiceItems: loadCsv('Invoice_Table1.csv'),
    cash: loadCsv('Cash_Table.csv'),
    expenses: loadCsv('Expense_Table.csv'),
    investments: loadCsv('Investment_Table.csv'),
    loans: loadCsv('Loan_Table.csv'),
    logins: loadCsv('Login.csv'),
  };
}

// ---------- conversions ----------

function toPaisa(rupees: string | undefined | null): number {
  if (!rupees || !rupees.trim()) return 0;
  const cleaned = rupees.replace(/[^0-9.\-]/g, '');
  const v = Number(cleaned);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function toQty(s: string | undefined | null): number {
  if (!s || !s.trim()) return 0;
  const v = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function nullable(s: string | undefined | null): string | null {
  if (s === undefined || s === null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

/** Convert a legacy timestamp (assumed Karachi local) to a UTC ISO string. */
function karachiTextToUtcIso(s: string | undefined | null): string | null {
  const v = nullable(s);
  if (!v) return null;
  // Accept "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DD", "YYYY-MM-DDTHH:mm:ss", etc.
  const normalized = v.replace(' ', 'T');
  const local = new Date(normalized);
  if (isNaN(local.getTime())) return null;
  // Treat the raw wall-clock as Karachi time and convert to UTC.
  const utc = fromZonedTime(normalized, KARACHI);
  if (isNaN(utc.getTime())) return null;
  return utc.toISOString();
}

/** Extract YYYY-MM-DD from a legacy timestamp without timezone shifting. */
function dateOnly(s: string | undefined | null): string | null {
  const v = nullable(s);
  if (!v) return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function mapPayMethod(s: string | undefined | null): PlannedPayment['method'] {
  const v = (s ?? '').trim().toLowerCase();
  if (v === 'bank' || v === 'bank_transfer' || v === 'transfer') return 'bank_transfer';
  if (v === 'cheque' || v === 'check') return 'cheque';
  if (v === 'online') return 'online';
  return 'cash';
}

function mapRole(s: string | undefined | null): PlannedUser['role'] {
  const v = (s ?? '').trim().toLowerCase();
  if (v === 'admin') return 'admin';
  if (v === 'accountant') return 'accountant';
  if (v === 'staff') return 'staff';
  return 'viewer';
}

function fmtPKR(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const r = (abs / 100).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}Rs. ${r}`;
}

// ---------- planning ----------

function buildPlan(data: ParsedData): Plan {
  const skipped: Skipped[] = [];
  const anomalies: Anomaly[] = [];
  const legacyBusinessId = randomUUID();

  // Customers
  const customerIdByLegacy = new Map<string, string>();
  const customers: PlannedCustomer[] = [];
  for (const r of data.customers) {
    const legacyId = r['customerid'];
    const name = r['customername'];
    if (!legacyId || !name) {
      skipped.push({ table: 'customers', legacyId: legacyId ?? '?', reason: 'Missing CustomerID or CustomerName' });
      continue;
    }
    const opening = toPaisa(r['openingbalance']);
    if (opening < 0) {
      anomalies.push({ table: 'customers', legacyId, note: `Negative opening balance ${fmtPKR(opening)}` });
    }
    const id = randomUUID();
    customerIdByLegacy.set(legacyId, id);
    customers.push({
      id,
      legacyId,
      name,
      phone: nullable(r['phone']),
      address: nullable(r['address']),
      openingBalancePaisa: opening,
      createdAtUtc: karachiTextToUtcIso(r['createddate']),
    });
  }

  // Products
  const productIdByLegacy = new Map<string, string>();
  const productPurchasePriceByLegacy = new Map<string, number>();
  const products: PlannedProduct[] = [];
  for (const r of data.products) {
    const legacyId = r['productid'];
    const name = r['productname'];
    if (!legacyId || !name) {
      skipped.push({ table: 'products', legacyId: legacyId ?? '?', reason: 'Missing ProductID or ProductName' });
      continue;
    }
    const id = randomUUID();
    const purchase = toPaisa(r['purchaseprice']);
    productIdByLegacy.set(legacyId, id);
    productPurchasePriceByLegacy.set(legacyId, purchase);
    if (!r['purchaseprice']?.trim()) {
      anomalies.push({ table: 'products', legacyId, note: 'Purchase price missing — defaulted to 0' });
    }
    products.push({
      id,
      legacyId,
      name,
      sku: nullable(r['sku']),
      unit: nullable(r['unit']) ?? 'unit',
      salePricePaisa: toPaisa(r['saleprice']),
      purchasePricePaisa: purchase,
      initialStock: toQty(r['stock']),
    });
  }

  // Stock movements (Stock_Table → type='in')
  const stockMovements: PlannedStockMovement[] = [];
  for (const r of data.stock) {
    const legacyId = r['stockid'];
    const legacyProductId = r['productid'];
    const productId = productIdByLegacy.get(legacyProductId);
    if (!productId) {
      skipped.push({ table: 'stock_movements', legacyId: legacyId ?? '?', reason: `Unknown ProductID ${legacyProductId}` });
      continue;
    }
    const qty = toQty(r['quantity']);
    if (qty <= 0) {
      anomalies.push({ table: 'stock_movements', legacyId, note: `Non-positive quantity ${qty}` });
    }
    const createdAt = karachiTextToUtcIso(r['date']) ?? new Date().toISOString();
    stockMovements.push({
      id: randomUUID(),
      legacyId,
      productId,
      quantity: qty,
      note: nullable(r['reference']),
      createdAtUtc: createdAt,
    });
  }

  // Invoices
  const invoiceIdByLegacy = new Map<string, string>();
  const invoices: PlannedInvoice[] = [];
  for (const r of data.invoices) {
    const legacyId = r['invoiceid'];
    const number = r['invoiceno'];
    const customerLegacyId = r['customerid'];
    if (!legacyId || !number) {
      skipped.push({ table: 'invoices', legacyId: legacyId ?? '?', reason: 'Missing InvoiceID or InvoiceNo' });
      continue;
    }
    const customerId = customerIdByLegacy.get(customerLegacyId);
    if (!customerId) {
      skipped.push({ table: 'invoices', legacyId, reason: `Unknown CustomerID ${customerLegacyId}` });
      continue;
    }
    const issueDate = dateOnly(r['invoicedate']) ?? new Date().toISOString().slice(0, 10);
    const total = toPaisa(r['total']);
    const paid = toPaisa(r['paid']);
    if (paid > total) {
      anomalies.push({ table: 'invoices', legacyId, note: `Paid ${fmtPKR(paid)} exceeds total ${fmtPKR(total)}` });
    }
    const status: PlannedInvoice['status'] =
      paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'issued';
    const id = randomUUID();
    invoiceIdByLegacy.set(legacyId, id);
    invoices.push({
      id,
      legacyId,
      customerId,
      invoiceNumber: number,
      issueDate,
      subtotalPaisa: toPaisa(r['subtotal']),
      discountPaisa: toPaisa(r['discount']),
      totalPaisa: total,
      paidPaisa: paid,
      notes: nullable(r['notes']),
      createdAtUtc: karachiTextToUtcIso(r['invoicedate']) ?? `${issueDate}T00:00:00Z`,
      status,
    });
  }

  // Invoice items
  const invoiceItems: PlannedInvoiceItem[] = [];
  for (const r of data.invoiceItems) {
    const lineId = r['id'];
    const invoiceLegacyId = r['invoiceid'];
    const productLegacyId = r['productid'];
    const invoiceId = invoiceIdByLegacy.get(invoiceLegacyId);
    const productId = productIdByLegacy.get(productLegacyId);
    if (!invoiceId) {
      skipped.push({ table: 'invoice_items', legacyId: lineId ?? '?', reason: `Unknown InvoiceID ${invoiceLegacyId}` });
      continue;
    }
    if (!productId) {
      skipped.push({ table: 'invoice_items', legacyId: lineId ?? '?', reason: `Unknown ProductID ${productLegacyId}` });
      continue;
    }
    const qty = toQty(r['qty']);
    const unitPrice = toPaisa(r['rate']);
    const purchasePrice = productPurchasePriceByLegacy.get(productLegacyId) ?? 0;
    invoiceItems.push({
      id: randomUUID(),
      invoiceId,
      productId,
      quantity: qty,
      unitPricePaisa: unitPrice,
      purchasePriceAtSalePaisa: purchasePrice,
      lineTotalPaisa: Math.round(qty * unitPrice),
    });
  }

  // Payments (Cash_Table)
  const payments: PlannedPayment[] = [];
  for (const r of data.cash) {
    const legacyId = r['cashid'];
    const customerLegacyId = r['customerid'];
    const customerId = customerIdByLegacy.get(customerLegacyId);
    if (!customerId) {
      skipped.push({ table: 'payments', legacyId: legacyId ?? '?', reason: `Unknown CustomerID ${customerLegacyId}` });
      continue;
    }
    const invoiceLegacyId = nullable(r['invoiceid']);
    let invoiceId: string | null = null;
    if (invoiceLegacyId) {
      invoiceId = invoiceIdByLegacy.get(invoiceLegacyId) ?? null;
      if (!invoiceId) {
        anomalies.push({ table: 'payments', legacyId, note: `InvoiceID ${invoiceLegacyId} not found — payment imported as on-account` });
      }
    }
    const amount = toPaisa(r['amount']);
    if (amount <= 0) {
      anomalies.push({ table: 'payments', legacyId, note: `Non-positive amount ${fmtPKR(amount)}` });
    }
    const paymentDate = dateOnly(r['paydate']) ?? new Date().toISOString().slice(0, 10);
    payments.push({
      id: randomUUID(),
      legacyId,
      customerId,
      invoiceId,
      amountPaisa: amount,
      method: mapPayMethod(r['paymethod']),
      reference: nullable(r['reference']),
      paymentDate,
      notes: nullable(r['notes']),
      createdAtUtc: karachiTextToUtcIso(r['paydate']) ?? `${paymentDate}T00:00:00Z`,
    });
  }

  // Expenses
  const expenses: PlannedExpense[] = [];
  for (const r of data.expenses) {
    const legacyId = r['expenseid'];
    const category = r['category'];
    if (!legacyId || !category) {
      skipped.push({ table: 'expenses', legacyId: legacyId ?? '?', reason: 'Missing ExpenseID or Category' });
      continue;
    }
    const date = dateOnly(r['expensedate']) ?? new Date().toISOString().slice(0, 10);
    expenses.push({
      id: randomUUID(),
      legacyId,
      category,
      description: nullable(r['description']),
      amountPaisa: toPaisa(r['amount']),
      expenseDate: date,
      createdAtUtc: karachiTextToUtcIso(r['expensedate']) ?? `${date}T00:00:00Z`,
    });
  }

  // Investments
  const investments: PlannedInvestment[] = [];
  for (const r of data.investments) {
    const legacyId = r['investmentid'];
    const investor = r['investorname'];
    if (!legacyId || !investor) {
      skipped.push({ table: 'investments', legacyId: legacyId ?? '?', reason: 'Missing InvestmentID or InvestorName' });
      continue;
    }
    investments.push({
      id: randomUUID(),
      legacyId,
      investorName: investor,
      amountPaisa: toPaisa(r['amount']),
      investmentDate: dateOnly(r['investmentdate']) ?? new Date().toISOString().slice(0, 10),
      notes: nullable(r['notes']),
    });
  }

  // Loans
  const loans: PlannedLoan[] = [];
  for (const r of data.loans) {
    const legacyId = r['loanid'];
    const party = r['partyname'];
    const dirRaw = (r['direction'] ?? '').trim().toLowerCase();
    if (!legacyId || !party) {
      skipped.push({ table: 'loans', legacyId: legacyId ?? '?', reason: 'Missing LoanID or PartyName' });
      continue;
    }
    if (dirRaw !== 'given' && dirRaw !== 'taken') {
      skipped.push({ table: 'loans', legacyId, reason: `Unknown Direction "${r['direction']}" (expected Given/Taken)` });
      continue;
    }
    const status = (r['status'] ?? '').trim().toLowerCase();
    loans.push({
      id: randomUUID(),
      legacyId,
      partyName: party,
      direction: dirRaw as 'given' | 'taken',
      principalPaisa: toPaisa(r['amount']),
      loanDate: dateOnly(r['loandate']) ?? new Date().toISOString().slice(0, 10),
      dueDate: dateOnly(r['duedate']),
      isSettled: status === 'repaid' || status === 'closed' || status === 'settled',
      notes: nullable(r['notes']),
    });
  }

  // Users (Login)
  const seenEmails = new Set<string>();
  const users: PlannedUser[] = [];
  for (const r of data.logins) {
    const legacyId = r['userid'] ?? r['username'];
    const username = r['username'];
    if (!username) {
      skipped.push({ table: 'users', legacyId: legacyId ?? '?', reason: 'Missing Username' });
      continue;
    }
    let email = nullable(r['email']);
    if (!email) email = `${username.toLowerCase()}@legacy.local`;
    if (seenEmails.has(email)) {
      skipped.push({ table: 'users', legacyId, reason: `Duplicate email ${email}` });
      continue;
    }
    seenEmails.add(email);
    const passwordRaw = nullable(r['password']);
    const passwordWasGenerated = !passwordRaw;
    const password = passwordRaw ?? `Tmp-${randomBytes(6).toString('hex')}!`;
    users.push({
      legacyId,
      email,
      password,
      passwordWasGenerated,
      fullName: nullable(r['fullname']) ?? username,
      role: mapRole(r['role']),
    });
  }

  return {
    legacyBusiness: { id: legacyBusinessId, name: LEGACY_BUSINESS_NAME },
    customers,
    products,
    stockMovements,
    invoices,
    invoiceItems,
    payments,
    expenses,
    investments,
    loans,
    users,
    skipped,
    anomalies,
  };
}

// ---------- balance math ----------

interface BalanceComparison {
  legacyId: string;
  name: string;
  legacyBalancePaisa: number;
  importedBalancePaisa: number;
}

function computeLegacyBalances(data: ParsedData): Map<string, number> {
  const bal = new Map<string, number>();
  for (const c of data.customers) {
    const id = c['customerid'];
    if (!id) continue;
    bal.set(id, toPaisa(c['openingbalance']));
  }
  for (const inv of data.invoices) {
    const cid = inv['customerid'];
    if (!bal.has(cid)) continue;
    bal.set(cid, (bal.get(cid) ?? 0) + toPaisa(inv['total']));
  }
  for (const p of data.cash) {
    const cid = p['customerid'];
    if (!bal.has(cid)) continue;
    bal.set(cid, (bal.get(cid) ?? 0) - toPaisa(p['amount']));
  }
  return bal;
}

function computeImportedBalances(plan: Plan): Map<string, number> {
  const bal = new Map<string, number>();
  for (const c of plan.customers) {
    bal.set(c.legacyId, c.openingBalancePaisa);
  }
  for (const inv of plan.invoices) {
    const legacyCustomerId = plan.customers.find((c) => c.id === inv.customerId)?.legacyId;
    if (!legacyCustomerId) continue;
    bal.set(legacyCustomerId, (bal.get(legacyCustomerId) ?? 0) + inv.totalPaisa);
  }
  for (const p of plan.payments) {
    const legacyCustomerId = plan.customers.find((c) => c.id === p.customerId)?.legacyId;
    if (!legacyCustomerId) continue;
    bal.set(legacyCustomerId, (bal.get(legacyCustomerId) ?? 0) - p.amountPaisa);
  }
  return bal;
}

// ---------- writer ----------

async function writeAll(plan: Plan, db: SupabaseClient): Promise<{ inserted: Record<string, number>; errors: string[] }> {
  const inserted: Record<string, number> = {};
  const errors: string[] = [];

  const tryInsert = async (table: string, rows: object[]) => {
    if (rows.length === 0) {
      inserted[table] = 0;
      return;
    }
    const { error } = await db.from(table).insert(rows);
    if (error) {
      errors.push(`${table}: ${error.message}`);
      inserted[table] = 0;
      return;
    }
    inserted[table] = rows.length;
  };

  // 1. Legacy business
  const { error: bizErr } = await db.from('businesses').insert({
    id: plan.legacyBusiness.id,
    name: plan.legacyBusiness.name,
    type: 'other',
  });
  if (bizErr) {
    errors.push(`businesses: ${bizErr.message}`);
    return { inserted, errors };
  }
  inserted['businesses'] = 1;

  // 2. Auth users (creates public.users via trigger; then link to business)
  const userIdByLegacy = new Map<string, string>();
  for (const u of plan.users) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.fullName, role: u.role },
    });
    if (error || !data.user) {
      errors.push(`users[${u.email}]: ${error?.message ?? 'no user returned'}`);
      continue;
    }
    userIdByLegacy.set(u.legacyId, data.user.id);
    // Trigger sets role via metadata; force-update in case existing default landed.
    await db.from('users').update({ role: u.role, full_name: u.fullName }).eq('id', data.user.id);
    await db.from('user_businesses').insert({ user_id: data.user.id, business_id: plan.legacyBusiness.id });
  }
  inserted['users'] = userIdByLegacy.size;

  // 3. Customers
  await tryInsert(
    'customers',
    plan.customers.map((c) => ({
      id: c.id,
      business_id: plan.legacyBusiness.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      opening_balance_paisa: c.openingBalancePaisa,
    })),
  );

  // 4. Products
  await tryInsert(
    'products',
    plan.products.map((p) => ({
      id: p.id,
      business_id: plan.legacyBusiness.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      sale_price_paisa: p.salePricePaisa,
      purchase_price_paisa: p.purchasePricePaisa,
    })),
  );

  // 5. Stock movements (legacy receipts)
  await tryInsert(
    'stock_movements',
    plan.stockMovements.map((s) => ({
      id: s.id,
      business_id: plan.legacyBusiness.id,
      product_id: s.productId,
      type: 'in',
      quantity: s.quantity,
      note: s.note,
      created_at: s.createdAtUtc,
    })),
  );

  // 6. Invoices (then items, then stock-out per item)
  await tryInsert(
    'invoices',
    plan.invoices.map((i) => ({
      id: i.id,
      business_id: plan.legacyBusiness.id,
      customer_id: i.customerId,
      invoice_number: i.invoiceNumber,
      status: i.status,
      issue_date: i.issueDate,
      subtotal_paisa: i.subtotalPaisa,
      discount_paisa: i.discountPaisa,
      total_paisa: i.totalPaisa,
      paid_paisa: i.paidPaisa,
      notes: i.notes,
    })),
  );
  await tryInsert(
    'invoice_items',
    plan.invoiceItems.map((it) => ({
      id: it.id,
      invoice_id: it.invoiceId,
      product_id: it.productId,
      quantity: it.quantity,
      unit_price_paisa: it.unitPricePaisa,
      purchase_price_at_sale_paisa: it.purchasePriceAtSalePaisa,
      line_total_paisa: it.lineTotalPaisa,
    })),
  );
  await tryInsert(
    'stock_movements',
    plan.invoiceItems.map((it) => ({
      business_id: plan.legacyBusiness.id,
      product_id: it.productId,
      invoice_id: it.invoiceId,
      type: 'out',
      quantity: it.quantity,
      note: 'Legacy invoice line',
    })),
  );

  // 7. Payments
  await tryInsert(
    'payments',
    plan.payments.map((p) => ({
      id: p.id,
      business_id: plan.legacyBusiness.id,
      customer_id: p.customerId,
      invoice_id: p.invoiceId,
      amount_paisa: p.amountPaisa,
      method: p.method,
      reference: p.reference,
      payment_date: p.paymentDate,
      notes: p.notes,
    })),
  );

  // 8. Expenses
  await tryInsert(
    'expenses',
    plan.expenses.map((e) => ({
      id: e.id,
      business_id: plan.legacyBusiness.id,
      type: 'business',
      category: e.category,
      description: e.description,
      amount_paisa: e.amountPaisa,
      expense_date: e.expenseDate,
    })),
  );

  // 9. Investments
  await tryInsert(
    'investments',
    plan.investments.map((iv) => ({
      id: iv.id,
      business_id: plan.legacyBusiness.id,
      investor_name: iv.investorName,
      amount_paisa: iv.amountPaisa,
      investment_date: iv.investmentDate,
      notes: iv.notes,
    })),
  );

  // 10. Loans
  await tryInsert(
    'loans',
    plan.loans.map((l) => ({
      id: l.id,
      business_id: plan.legacyBusiness.id,
      party_name: l.partyName,
      direction: l.direction,
      principal_paisa: l.principalPaisa,
      balance_paisa: l.isSettled ? 0 : l.principalPaisa,
      loan_date: l.loanDate,
      due_date: l.dueDate,
      is_settled: l.isSettled,
      notes: l.notes,
    })),
  );

  return { inserted, errors };
}

// ---------- reporting ----------

interface ReportOpts {
  mode: 'DRY RUN' | 'CONFIRMED';
  data: ParsedData;
  plan: Plan;
  inserted?: Record<string, number>;
  writeErrors?: string[];
}

function buildReport(opts: ReportOpts): string {
  const { mode, data, plan, inserted = {}, writeErrors = [] } = opts;
  const lines: string[] = [];
  const generatedAt = new Date().toISOString();

  lines.push(`# Legacy Migration Report`);
  lines.push('');
  lines.push(`- **Mode:** ${mode}`);
  lines.push(`- **Generated:** ${generatedAt}`);
  lines.push(`- **Source folder:** \`migration_data/\``);
  lines.push(`- **Legacy business UUID:** \`${plan.legacyBusiness.id}\``);
  lines.push('');

  // Row counts
  lines.push(`## Row counts (source → target)`);
  lines.push('');
  lines.push(`| Source CSV | Source rows | Planned | ${mode === 'CONFIRMED' ? 'Inserted' : 'Would-insert'} |`);
  lines.push(`|---|---:|---:|---:|`);
  const counts: [string, number, number, string][] = [
    ['Customer_Table.csv', data.customers.length, plan.customers.length, 'customers'],
    ['Product.csv', data.products.length, plan.products.length, 'products'],
    ['Stock_Table.csv', data.stock.length, plan.stockMovements.length, 'stock_movements'],
    ['Invoice_Table.csv', data.invoices.length, plan.invoices.length, 'invoices'],
    ['Invoice_Table1.csv', data.invoiceItems.length, plan.invoiceItems.length, 'invoice_items'],
    ['Cash_Table.csv', data.cash.length, plan.payments.length, 'payments'],
    ['Expense_Table.csv', data.expenses.length, plan.expenses.length, 'expenses'],
    ['Investment_Table.csv', data.investments.length, plan.investments.length, 'investments'],
    ['Loan_Table.csv', data.loans.length, plan.loans.length, 'loans'],
    ['Login.csv', data.logins.length, plan.users.length, 'users'],
  ];
  for (const [src, srcN, planN, tbl] of counts) {
    const writeN = mode === 'CONFIRMED' ? (inserted[tbl] ?? 0) : planN;
    lines.push(`| ${src} | ${srcN} | ${planN} | ${writeN} |`);
  }
  lines.push('');

  // Receivables
  const legacyBalances = computeLegacyBalances(data);
  const importedBalances = computeImportedBalances(plan);
  const sumLegacy = Array.from(legacyBalances.values()).reduce((a, b) => a + b, 0);
  const sumImported = Array.from(importedBalances.values()).reduce((a, b) => a + b, 0);
  lines.push(`## Sum receivables`);
  lines.push('');
  lines.push(`- **Legacy total:**   ${fmtPKR(sumLegacy)}`);
  lines.push(`- **Imported total:** ${fmtPKR(sumImported)}`);
  lines.push(`- **Diff:**           ${fmtPKR(sumImported - sumLegacy)} ${sumImported === sumLegacy ? '✅' : '⚠️'}`);
  lines.push('');

  // Top 10 by balance — legacy vs imported
  const comparisons: BalanceComparison[] = plan.customers.map((c) => ({
    legacyId: c.legacyId,
    name: c.name,
    legacyBalancePaisa: legacyBalances.get(c.legacyId) ?? 0,
    importedBalancePaisa: importedBalances.get(c.legacyId) ?? 0,
  }));
  const top10 = [...comparisons]
    .sort((a, b) => Math.abs(b.legacyBalancePaisa) - Math.abs(a.legacyBalancePaisa))
    .slice(0, 10);
  lines.push(`## Top 10 customers by balance (legacy vs imported)`);
  lines.push('');
  lines.push(`| Legacy ID | Name | Legacy balance | Imported balance | Match |`);
  lines.push(`|---|---|---:|---:|:---:|`);
  for (const c of top10) {
    const match = c.legacyBalancePaisa === c.importedBalancePaisa ? '✅' : '⚠️';
    lines.push(`| ${c.legacyId} | ${c.name} | ${fmtPKR(c.legacyBalancePaisa)} | ${fmtPKR(c.importedBalancePaisa)} | ${match} |`);
  }
  lines.push('');

  // Skipped
  lines.push(`## Skipped rows (${plan.skipped.length})`);
  lines.push('');
  if (plan.skipped.length === 0) {
    lines.push('_None._');
  } else {
    lines.push(`| Table | Legacy ID | Reason |`);
    lines.push(`|---|---|---|`);
    for (const s of plan.skipped) lines.push(`| ${s.table} | ${s.legacyId} | ${s.reason} |`);
  }
  lines.push('');

  // Anomalies
  lines.push(`## Anomalies (${plan.anomalies.length})`);
  lines.push('');
  if (plan.anomalies.length === 0) {
    lines.push('_None._');
  } else {
    lines.push(`| Table | Legacy ID | Note |`);
    lines.push(`|---|---|---|`);
    for (const a of plan.anomalies) lines.push(`| ${a.table} | ${a.legacyId} | ${a.note} |`);
  }
  lines.push('');

  // Generated passwords
  const generated = plan.users.filter((u) => u.passwordWasGenerated);
  if (generated.length > 0) {
    lines.push(`## Auto-generated user passwords`);
    lines.push('');
    lines.push('These users had no legacy password and were assigned a temp password. Share securely with the user and have them rotate on first login.');
    lines.push('');
    lines.push(`| Email | Temp password |`);
    lines.push(`|---|---|`);
    for (const u of generated) lines.push(`| ${u.email} | \`${u.password}\` |`);
    lines.push('');
  }

  // Write errors
  if (mode === 'CONFIRMED' && writeErrors.length > 0) {
    lines.push(`## Write errors (${writeErrors.length})`);
    lines.push('');
    for (const e of writeErrors) lines.push(`- ${e}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- main ----------

async function main() {
  const { dryRun, confirm } = parseArgs();
  console.log(`\n=== KOC Legacy Migrator ===`);
  console.log(`Mode: ${confirm ? 'CONFIRMED (will write)' : 'DRY RUN (no writes)'}`);
  console.log(`CSV directory: ${CSV_DIR}\n`);

  // Load
  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(CSV_DIR, f))) {
      console.error(`✗ Missing required CSV: ${f}`);
      process.exit(1);
    }
  }
  const data = loadAll();
  console.log('Loaded CSVs:');
  for (const [k, v] of Object.entries(data)) console.log(`  ${k}: ${v.length} rows`);

  // Plan
  const plan = buildPlan(data);
  console.log(`\nPlanned: ${plan.customers.length} customers, ${plan.products.length} products, ${plan.invoices.length} invoices, ${plan.payments.length} payments, ${plan.expenses.length} expenses, ${plan.users.length} users`);
  console.log(`Skipped: ${plan.skipped.length}, Anomalies: ${plan.anomalies.length}`);

  let inserted: Record<string, number> | undefined;
  let writeErrors: string[] | undefined;

  if (confirm) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('\n✗ Confirm mode requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.');
      process.exit(1);
    }
    console.log(`\nWriting to Supabase project: ${url}`);
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await writeAll(plan, db);
    inserted = result.inserted;
    writeErrors = result.errors;
    console.log(`\nInserted:`);
    for (const [t, n] of Object.entries(inserted)) console.log(`  ${t}: ${n}`);
    if (writeErrors.length > 0) {
      console.log(`\nWrite errors: ${writeErrors.length}`);
      for (const e of writeErrors) console.log(`  - ${e}`);
    }
  }

  // Report
  const report = buildReport({
    mode: confirm ? 'CONFIRMED' : 'DRY RUN',
    data,
    plan,
    inserted,
    writeErrors,
  });
  writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\nReport written to: ${REPORT_PATH}`);
  console.log(`\n${'─'.repeat(72)}`);
  console.log(report);

  // Acknowledge dryRun in flow even if unused logically — keeps intent explicit.
  if (dryRun && !confirm) {
    console.log('\nDry run complete. No data was written. Re-run with --confirm to write.');
  }
}

main().catch((err) => {
  console.error('\n✗ Migration failed:', err);
  process.exit(1);
});
