# PDF Export Audit — Phase 1

Audit date: 21 Aug 2026. Scope: every export path in the repository, what feeds
it, and where it loses data. No code changed.

---

## 0. Headline: the brief's diagnosis does not match this repository

The brief states the export "only dumps whatever rows happen to be rendered on
screen" because generation is client-side. **That is not the cause here.**

- **26 of 28 export entry points already run server-side**, in `'use server'`
  actions that query the database themselves (`lib/actions/reports.tsx`,
  `sales-report.ts`, `brand-stock-report.tsx`, `expense-reports.tsx`). They
  never see React state.
- Only **two** exports render in the browser: the invoice PDF and the customer
  statement.

So "move generation to the backend" is largely already done. **There is a real
truncation bug, but it has a different cause and a different fix**, described
in §3.1. Building the proposed architecture without fixing that would produce a
new system with the same silent data loss.

---

## 1. Module inventory

| Module | List view | Detail view | Data source | Export today |
|---|---|---|---|---|
| Customers | `/customers` → `CustomerTable` | `/customers/[id]` → `CustomerDetailTabs` | `useCustomers`, `useCustomersWithBalance` | **none on list**; statement PDF on ledger tab |
| Products | `/products` → `ProductTable` | `/products/[id]` | `useProducts`, `useBrands` | `ExportStockButtons` (brand stock) |
| Suppliers | `/suppliers` → `SupplierTable` | `/suppliers/[id]` | `useSuppliers` | **none** |
| Stock | `/stock` → `StockList` | — | `current_stock` view | **none on page**; `/reports/stock` has one |
| Invoices | `/invoices` → `InvoiceTable` | `/invoices/[id]` | `useInvoices`, `useInvoiceDetail` | **none on list**; per-invoice PDF on detail |
| Payments | `/payments` → `PaymentTable` | — | `usePayments` | **none** |
| Expenses | `/expenses` → `ExpenseTable` | — | `useExpenses` | **none on list**; `/reports/expenses` has one |
| Returns | `/returns/new`, shown on invoice detail | — | `useReturnForm` | **none** |
| Ledger | `/ledger` | — | `useCustomerLedger` | **none** |
| Investments / Loans | `/investments`, `/loans` | — | `useInvestments`, `useLoans` | **none** |
| Reports | 11 pages under `/reports` | — | `lib/queries/reports.ts` | PDF + Excel each |
| Backup | `/settings/backup` | — | `lib/backup/load-dataset.ts` | 28-sheet Excel |

**Coverage gap: 6 of 7 primary list views have no export at all** — customers,
suppliers, invoices, payments, expenses, stock. The brief's §5 table treats
these as existing-but-broken; they are absent.

---

## 2. Existing export inventory

### 2.1 Server-side (26)

`lib/actions/reports.tsx` — sales, purchase, customer, balance, P&L,
defaulters, stock, cash book, audit, location (PDF + Excel each).
`lib/actions/sales-report.ts` — sales analytics.
`lib/actions/brand-stock-report.tsx` — brand stock.
`lib/actions/expense-reports.tsx` — expense analytics.

All follow the same shape: `ensureRole(...)` → `fetch*Data()` → `renderToBuffer`
or ExcelJS → base64 → `downloadBase64()` on the client.

### 2.2 Client-side (2)

| Export | File | Risk |
|---|---|---|
| Invoice PDF | `components/invoices/InvoicePDF.tsx` via `PDFDownloadLink` | Low. One invoice, all line items, no pagination. |
| Customer statement | `components/customers/CustomerStatementPDF.tsx` | **High — see §3.1.** |

---

## 3. Why data is lost — root causes, in order of severity

### 3.1 The real truncation: PostgREST's 1000-row cap, unpaged

`lib/reports/data.ts` contains **zero paged reads** (`fetchPaged` / `.range()`
count: 0). Supabase enforces `db.max_rows = 1000` on every PostgREST response.
Any report whose filtered set exceeds 1000 rows is **silently cut to 1000** —
no error, no warning, and the totals below the table are then computed over the
truncated array (§3.2), so the numbers are wrong as well as incomplete.

`lib/queries/customer-ledger.ts` has no limit either, so the **customer
statement PDF silently truncates at 1000 ledger rows**.

This is the same class of bug already found and fixed once in this codebase:
the Excel backup used `.limit(50_000)` and lost everything past 1000 until
`lib/backup/load-dataset.ts` was rewritten to page at 1000 (17 paged reads
today). **The report layer never received that fix.**

Two explicit caps also exist: `data.ts:119` `.limit(5000)` on scoped sales, and
`data.ts:665` `.limit(500)` on the audit report.

### 3.2 Aggregates are summed in JS over the fetched array

14 `reduce()` calls in `lib/reports/data.ts` and 19 more in the report
components. Every total is therefore a total *of what was fetched*, not of what
matched. Combined with §3.1, a 3,000-invoice month reports the sum of 1,000
invoices as its grand total, presented as fact.

The brief's §7 requirement — "compute aggregates with SQL aggregate queries" —
is correct and currently unmet everywhere.

### 3.3 Filters reach the export only partially

| Export | Receives | UI also offers | Gap |
|---|---|---|---|
| Sales | `range`, `brandId`, `productId` | — | none (fixed this session) |
| Purchase, P&L, cash book | `range` only | — | none |
| Customer, balance, defaulters, stock | **nothing** | search, sort, location filter | exports always dump everything, ignoring the filtered view |
| Audit | `filters` | user, action, date | none |

So the brief's "ignores active filters" is true for **4 of 13** report exports,
and true for every list view that has no export at all.

### 3.4 Statistics are only partly reproduced

Counting KPI blocks in `components/reports/pdfs.tsx`:

| Report | KPI cards in UI | KPI block in PDF |
|---|---|---|
| Sales | 3 | ✅ |
| Purchase | 2 | ✅ |
| Balance | 3 | ✅ |
| Location | 3 | ✅ |
| **Customer** | 3 | ❌ **missing** |
| **P&L** | 5 | ❌ **missing** |

No PDF embeds any **chart**, though six report screens render Recharts
visuals. The sales-analytics PDF omits its trend line, brand donut and top-10
bar chart.

### 3.5 Document furniture is missing across all PDFs

- **`Page X of Y`: 0 occurrences.** No PDF paginates its footer.
- **Company identity is name-only.** `business_address` and `business_phone`
  exist in `app_settings` and are unused by every PDF. There is no NTN/tax
  number field in the schema at all, and no logo asset.
- **No `Font.register` anywhere** — every PDF relies on built-in Helvetica,
  which has **no Urdu/Arabic glyph coverage**. Any non-Latin customer name
  renders blank or as tofu. For a Pakistani business this is a live defect.
- Generated-at and generated-by appear on some reports, not all.

### 3.6 Authorization is on the old role check

Exports gate on `ensureRole(...roles)` — the raw session role. The app has
since moved to `currentUserCan(permission)` (0051) and `currentUserCanAccess(pageKey)`
(0056). **An export can therefore still be produced by a user whose page access
to that report has been revoked.** This is a genuine authorization hole opened
by the newer access system, not by the exports themselves.

### 3.7 Export logging is inconsistent

`sales-report.ts` logs exports to `activity_log`, reusing the
`backup.downloaded` action for want of a better key. The other 24 server
exports log nothing. There is no dedicated export audit table and no record of
filters or row counts.

---

## 4. Derived values that must be reproduced in exports

Values shown in the UI that are **not** raw columns. Each needs a server-side
aggregate if it is to appear in a PDF truthfully.

| Value | Computed in | Notes |
|---|---|---|
| Invoice subtotal / discount / total | `lib/invoice.ts` (server, in RPC too) | Recomputed server-side on create; safe |
| Balance due, previous balance | `lib/invoice-totals.ts` (client) | Uses `invoice_previous_balance()` RPC |
| Customer running balance, aging | `lib/queries/customers-balance.ts` (client) | Ledger-derived |
| Stock on hand | `current_stock` view / `product_stock_on_hand()` | Server |
| Stock value at sale & at cost | client `reduce` | Not a column |
| Low-stock and out-of-stock counts | client filter | Not a column |
| Net sales after discount share and returns | `sales_analytics_view` (0052) | **Server — reusable** |
| Per-period totals (7/15/30/90/365-day) | `product_sales_periods_view` (0052), `lib/backup/sales-periods.ts` | **Server — reusable** |
| Period-over-period % change | `lib/sales-analytics.ts` `percentChange` | Client, pure |
| Dead stock | `lib/sales-analytics.ts` `deadStock` | Client, pure |
| Expense category shares | `expense_asset_summary_view` (0043) | Server |
| P&L: COGS, gross profit | `lib/queries/reports.ts` `usePLReport` | Client `reduce` |
| Supplier outstanding payable | client | No aging buckets exist anywhere yet |

**Note:** aging buckets for suppliers, and a tax/sales-tax report, are listed in
the brief's §5 but **the schema has no tax fields and no supplier aging
calculation**. Those two reports cannot be built without schema work — flagged
in §6 as a question.

---

## 5. What I would recommend, and where I disagree with the brief

1. **Do not adopt Puppeteer/Playwright.** The app deploys to Vercel; headless
   Chromium there means a heavier runtime and cold starts, and the repo already
   has a working, tested `@react-pdf/renderer` layer with a shared style object.
   The brief allows this alternative "if justified" — this is the justification.
   Recommend keeping `@react-pdf/renderer` and building the shared template
   partials on top of it.
2. **Fix §3.1 and §3.2 first, before any new architecture.** They are the
   defects that actually lose data, they affect every existing report, and they
   are a day's work rather than a rewrite. A descriptor system built on unpaged
   reads would inherit the bug.
3. **The descriptor contract is a good idea and I would keep it**, but with
   `fetch` returning aggregates from SQL rather than rows-plus-JS-reduce.
4. **The audit table should be its own table**, not `activity_log` — the brief
   asks for filters and row counts, which do not belong in a human-readable
   feed.

---

## 6. Questions before Phase 2

1. **Scale.** Largest realistic report today is ~1,150 invoices and ~92
   customers. The brief specifies streaming, background jobs and 50k-row tests.
   Should I build for the current scale (single request, paged reads) and leave
   a documented seam for queuing, or build the job queue now?
2. **Company identity.** There is no logo asset and no NTN/tax field in the
   schema. Add `business_logo_url` and `business_ntn` to `app_settings`?
3. **Tax report and supplier aging** have no underlying data (§4). Skip, or add
   the schema first?
4. **Urdu/RTL.** Is non-Latin text actually entered in practice? It changes the
   font work from "embed one font" to "embed and handle bidi".
5. **Feature flag.** The brief asks to keep old exports behind a flag. This repo
   has no feature-flag mechanism. Add one, or migrate report-by-report with the
   old action deleted in the same commit once its replacement is verified?

---

## 7. Proposed order of work

1. Page every read in `lib/reports/data.ts`; move totals to SQL aggregates.
   (Fixes every existing report.)
2. Authorization: swap `ensureRole` for the page-access check.
3. Shared template partials — header with company block, footer with `Page X of
   Y`, filter block, summary grid, table with repeating header, totals row.
   Embed a Unicode font.
4. Descriptor registry + generic endpoint.
5. Products and Invoices as the two reference implementations, each verified by
   generating and opening a real PDF.
6. **Pause for review**, then roll out the remaining modules.

---

**Phase 1 complete. Awaiting confirmation before Phase 2.**
