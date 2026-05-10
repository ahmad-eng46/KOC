# MEMORY.md

> Living document of project state. Update at the end of every working session.
> Keep entries concise. Past entries archived to `docs/memory-archive.md` quarterly.

---

## Current Phase

**Phase 1 — Foundation & Database** ✅ COMPLETE
**Phase 2 — Core Modules** ✅ COMPLETE
**Phase 3 — Reports & Communication** 🔨 IN PROGRESS (Piece 10 deferred pending Twilio/WhatsApp creds)
**Piece in progress:** None
**Next piece:** Piece 10 — SMS + WhatsApp (when creds available) OR Piece 12 — Backup System

---

## Quick Status

- [x] Planning complete
- [x] CLAUDE.md / MEMORY.md / DECISIONS.md created
- [x] Supabase project created (ref: drqpqjsamguffwkxiilp, region: Singapore)
- [ ] Vercel project created
- [ ] GitHub repo created and pushed
- [x] First commit
- [x] Database schema deployed (15 migrations applied)
- [x] RLS policies live (0017_rls_policies.sql)
- [x] Auth working (login page + session + proxy)
- [x] First feature shipped (dashboard placeholder)
- [x] PWA configured (manifest + icons)

---

## Last Session

**Date:** 2026-05-11
**Worked on:** Piece 11 — User Management (Piece 10 deferred — no Twilio/WhatsApp creds)
**Completed:** Admin user CRUD, last-admin invariants, login history RPC, profile + password change
**Blocked by:** Nothing
**Next:** Piece 12 — Backup System (or Piece 10 once messaging creds are ready)

---

## Active Decisions In Effect

These are the decisions currently driving the build. Full history in `DECISIONS.md`.

| # | Decision | Status |
|---|---|---|
| 1 | Tech stack: Next.js + Supabase + Vercel | ✅ Locked |
| 2 | No native mobile — PWA web only | ✅ Locked |
| 3 | Roles: Admin / Accountant / Staff / Viewer (no overrides) | ✅ Locked |
| 4 | Login by email + password (no PIN, no SSO) | ✅ Locked |
| 5 | Admin-only user creation; can reset but not view passwords | ✅ Locked |
| 6 | Multi-business model: one owner, multiple businesses, switcher | ✅ Locked |
| 7 | Money stored as BIGINT paisa (1 PKR = 100 paisa) | ✅ Locked |
| 8 | Soft delete for all financial records | ✅ Locked |
| 9 | Backup: manual Excel + scheduled (1/3/5/7/15/30 days) + daily SQL dump | ✅ Locked |
| 10 | Defaulter rule: 20 days configurable, red highlight | ✅ Locked |
| 11 | Home expenses: separate, admin toggle for P&L inclusion | ✅ Locked |

---

## Build Pieces — Progress Tracker

Total: 15 pieces across 4 phases. Tick as completed.

### Phase 1: Foundation
- [x] **Piece 1** — Database Schema + Seed Data
- [x] **Piece 2** — Auth + Row Level Security
- [x] **Piece 3** — Next.js Scaffold + Shared UI

### Phase 2: Core Modules
- [x] **Piece 4** — Multi-Business Switching
- [x] **Piece 5** — Customers + Products + Stock
- [x] **Piece 6** — Invoicing + Returns
- [x] **Piece 7** — Payments + Ledger
- [x] **Piece 8** — Expenses + Investments + Loans

### Phase 3: Reports & Communication
- [x] **Piece 9** — Reports + P&L
- [~] **Piece 10** — SMS + WhatsApp Integration _(deferred until Twilio + WhatsApp Meta Business credentials provisioned)_
- [x] **Piece 11** — User Management (Admin)
- [ ] **Piece 12** — Backup System

### Phase 4: Launch
- [ ] **Piece 13** — Data Migration from .mdf
- [ ] **Piece 14** — Production Deployment
- [ ] **Piece 15** — Training + Handover

---

## Open Questions / TODOs

_(Use this section for things you've parked. Move to DECISIONS.md once resolved.)_

- [ ] Domain name to purchase: `khaliqoil.com` or alternative?
- [ ] Confirm SMS gateway: Twilio (international, easier) vs Pakistani gateway (cheaper)?
- [ ] How many staff users will the system have day 1?
- [ ] Are there any specific report formats from the legacy `.rdlc` files we need to match exactly?
- [ ] Confirm: backup frequency default = 7 days? _(seeded as 7 for now)_
- [ ] Confirm: default for "include home expenses in P&L" = OFF? _(seeded as false for now)_

---

## Known Issues / Tech Debt

- `auth.user_role()` could not be created in the `auth` schema on Supabase cloud (permission denied). Function lives in `public.user_role()` instead. All RLS policies must reference `public.user_role()`.
- Seed users were inserted directly into `auth.users` using a pre-hashed bcrypt password (`KocTest2024!`). In production, use Supabase Auth Admin API to create users properly.
- `0016_seed.sql` is included in migrations (not a separate seed file) because `supabase db query` only targets local DB. This is fine for dev — do not run on production.
- **Customer balance query** (`lib/queries/customers-balance.ts`) fetches all `ledger_entries` for the active business and sums `debit - credit` per customer client-side. Acceptable at current scale (~130 entries, 50 customers); replace with a server-side VIEW (e.g. `customer_balances_view`) before production launch — target Piece 7 or Piece 9.

---

## Useful Snippets / Things I Always Forget

```bash
# Push migrations to cloud
export SUPABASE_ACCESS_TOKEN=<token>
supabase db push

# Generate TypeScript types from remote schema
export SUPABASE_ACCESS_TOKEN=<token>
supabase gen types typescript --project-id drqpqjsamguffwkxiilp > types/database.ts

# Supabase project ref
drqpqjsamguffwkxiilp
```

---

## Session Log

### Session 10 — 2026-05-11
- **Worked on:** Piece 11 — User Management. (Piece 10 SMS/WhatsApp deferred — `.env.local` had Twilio/WhatsApp keys commented out with no values.)
- **Files added:**
  - `lib/auth/admin-checks.ts` — `countActiveAdmins()` + 3 pure invariant helpers
  - `lib/validators/user.ts` — Zod schemas for create/update/passwords/profile
  - `lib/actions/user.ts` — 9 server actions (createUser, updateUser, resetUserPassword, softDeleteUser, restoreUser, listUsersWithBusinesses, getUserLoginHistory, changeOwnPassword, updateOwnProfile)
  - `lib/actions/user.test.ts` — 12 unit tests for last-admin invariants
  - `lib/queries/users.ts` — TanStack Query hooks
  - `components/settings/UserForm.tsx` — shared create/edit form
  - `components/settings/UserTable.tsx` — TanStack table + 5 inline modals (Create/Edit/Reset/Delete/LoginHistory) + kebab menu + password reveal dialog
  - `components/profile/ProfileForm.tsx`
  - `components/profile/ChangePasswordForm.tsx`
  - `app/(app)/settings/users/page.tsx` (admin only)
  - `app/(app)/profile/page.tsx` (all roles)
  - `scripts/test-user-actions.mjs` — live end-to-end smoke test
- **Files modified:** `components/layout/UserMenu.tsx` adds /profile link
- **Migrations:**
  - `0033_user_management.sql` — adds phone copy to `handle_new_auth_user`; adds `handle_new_session` trigger to populate `public.users.last_login_at` from `auth.sessions` INSERT
  - `0034_login_history_rpc.sql` — `user_login_history(p_user_id, p_limit)` SECURITY DEFINER RPC reading `auth.sessions`, admin-only
  - `0035_fix_login_history_rpc.sql` — explicit type casts (auth.sessions.user_agent is varchar, ip is inet) to fix RETURNS TABLE mismatch
- **Audit findings (all resolved):**
  - Service-role key not in client bundle: 4 grep scans of `.next/static` returned 0 matches for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, and the actual key prefix
  - Runtime guard in `lib/supabase/admin.ts:5-10` throws on browser import (verified)
  - `UserTable.tsx` has zero direct imports of admin client and zero raw service-role references
  - **Bug fixed during audit:** kebab-menu Disable/Enable/Restore mutations resolve `{ok:false, error:...}` (not throw), so React Query stored the error in `mutation.data.error` not `mutation.error`. The status footer in `UserTable.tsx` only checked `.error.message`, so last-admin disable attempts were silently swallowed. Updated to check `.data.error` first, then fall back to thrown errors.
- **Verifications:**
  - `pnpm tsc --noEmit` clean
  - `pnpm vitest run` → 48/48 tests pass (12 new for user invariants)
  - `pnpm build` → 35 routes (added `/settings/users`, `/profile`)
  - Live `scripts/test-user-actions.mjs` end-to-end: create staff → sign in → disable+ban → "User is banned" on retry → reset password → old fails / new works → soft delete + audit row → cleanup
  - `user_login_history` RPC verified live, returning real session rows with IP + user_agent for `owner@khaliqoil.com`
- **Login history status:** Working. RPC reads `auth.sessions` directly via SECURITY DEFINER. No fallback table needed. Trigger on `auth.sessions` INSERT also stamps `public.users.last_login_at` on every fresh sign-in.
- **Notes:**
  - Admin actions return `{ok, error?}` rather than throwing. Modals consume this via `serverError` props; the table-level error footer was patched to consume `mutation.data.error` for kebab-only actions.
  - `softDeleteUser` bans for ~100 years (876000h) AND force-signs-out globally — disabled users see "User is banned" within milliseconds.
  - `changeOwnPassword` verifies current password via fresh `fetch` to `/auth/v1/token` (no session pollution) before calling the admin API to update.
  - Email is immutable in `updateUser` — schema doesn't allow it, action doesn't write it.
  - `setUserBusinesses` is delete-then-insert (not atomic). Acceptable at this concurrency; revisit if multi-admin edits become common.
  - The dual audit log (trigger on `public.users` + manual `auth.users` row) creates 2 audit entries per role change. Intentional for traceability.

### Session 9 — 2026-05-10
- **Worked on:** Piece 9 — Reports + P&L (all 9 reports + exports)
- **Done:**
  - Added `recharts` and `exceljs` deps. Reused `@react-pdf/renderer` for PDF exports (server-side via `renderToBuffer`).
  - **Shared layer:** `lib/reports/download.ts` (base64 → Blob download), `components/reports/shared.tsx` (`FilterBar` with date presets Today/Week/Month/Year/Custom, `KPICard`, `ExportButtons` running server actions).
  - **Reports landing:** `/reports` permission-filtered tile grid linking to all 9 sub-reports.
  - **1. Sales** — invoices in range; KPI total/paid/outstanding; Recharts line chart by day; top-10 customers table.
  - **2. Purchase** (admin/accountant) — stock_movements type='in'; KPI total value + count; group by product; movement detail.
  - **3. Customer** — per-customer invoiced / paid / balance / last activity from `ledger_entries`; sortable; search.
  - **4. Receivables** — customers with balance > 0; aging buckets 0-30 / 31-60 / 61-90 / 90+; KPIs per bucket.
  - **5. P&L** — periods Today / Week / Month / Year / Custom. Sales − Returns = Net Sales. COGS uses **captured-at-sale `purchase_price_at_sale_paisa`** (not current product price). HomeExp included only if `app_settings.home_expense_in_pnl='true'`. Recharts horizontal bar chart of expenses by category (blue=business, amber=home).
    - **Math verified at SQL level**: Sales=Rs 18,794,660.20; COGS=Rs 18,261,403; Gross Profit=Rs 533,257.20; OpEx=Rs 89,846.05; HomeExp=Rs 85,846.05 (excluded); Net Profit=Rs 443,411.15. SQL invariants confirmed.
  - **6. Defaulters** — customers with balance > 0 AND inactive ≥ `app_settings.defaulter_days` (default 20). Red-tinted rows. WhatsApp reminder button placeholder (Piece 10).
  - **7. Stock** — current quantity per active product; value at cost (admin/accountant only). Low-stock highlight + filter.
  - **8. Daily Cash Book** — cash payments (method='cash') vs cash expenses; per-row up/down arrows; closing balance footer.
  - **9. Audit Log** (admin only) — table/action/user/date filter; expandable rows showing before/after JSON diff side by side.
  - **Exports** — `lib/actions/reports.tsx` (named .tsx because PDFs use JSX): each report has `export<Name>Pdf` and `export<Name>Excel` server actions returning `{ ok, base64, filename }`. Client decodes via `downloadBase64` and triggers `<a download>`. PDFs use `renderToBuffer`; Excel uses `wb.xlsx.writeBuffer()`.
  - **Server-side data layer:** `lib/reports/data.ts` houses the canonical fetchers used by both export actions (and would also be used by future scheduled jobs). Client queries in `lib/queries/reports.ts` mirror the same logic for live UI updates.
  - **PDF documents:** `components/reports/pdfs.tsx` houses `Document`/`Page`/`View`/`Text` JSX for all 9 reports. Imported by both server actions (renderToBuffer) and could be by client PDFDownloadLink if needed.
- **Notes:**
  - **Spec STOP point at #5 P&L was honored** by running the equivalent SQL invariant directly against the live DB and confirming exact match before continuing to reports 6-9.
  - **COGS uses captured-at-sale price** — `invoice_items.purchase_price_at_sale_paisa` (snapshot taken inside `create_invoice_atomic` RPC during Piece 6). This protects margin reporting from later product price changes.
  - **Stock cost visibility** is role-gated client-side AND in the export server action — staff/viewer roles never see cost columns in either UI or PDF/Excel exports.
  - **Audit log pulled from existing `audit_log` table** populated by triggers on every financial table since Piece 1. The `audit_app_settings` trigger added in Piece 8 means settings changes also appear here.
  - 33 routes in production build; 36 unit tests still pass; no TS errors.

### Session 8 — 2026-05-10
- **Worked on:** Piece 8 — Expenses + Investments + Loans + Settings (Phase 2 closeout)
- **Done:**
  - `0032_expense_receipts_and_settings_audit.sql` — added `expenses.receipt_url`; created private `receipts` Storage bucket with RLS policies (path convention `receipts/{business_id}/...`, scoped via `user_has_business()`, INSERT/DELETE limited to admin+accountant); added `audit_app_settings` trigger using `log_audit()`
  - **Expenses**: validators (`expenseTypes`, `expenseCategories`), actions (`createExpense`, `softDeleteExpense`), `useExpenses` query, `ExpenseForm` (type radio Business/Home, category dropdown, file upload to Storage with signed-URL view), `ExpenseTable` (date range, type pills, search, summary cards Total/Business/Home, receipt button opens signed URL), `app/(app)/expenses/{page,new/page}.tsx`. Home expenses default to `include_in_pnl=false` at row level.
  - **Investments** (admin only): validator, `createInvestment` action, `useInvestments` query, `InvestmentForm` (source/investor, amount, date, note), `InvestmentTable` with running-total card showing total invested + entry count + distinct sources
  - **Loans** (admin only): validator (`loanDirections=given|taken`), actions (`createLoan`, `markLoanRepaid`), `useLoans`/`useMarkLoanRepaid` queries, `LoanForm` (direction radio, party mode toggle Existing customer/Free text, amount, loan date + due date, note), `LoanTable` with two outstanding-balance cards, type/status filters, overdue indicator on due date, "Mark Repaid" action
  - **Settings**: `lib/settings.ts` (`getSetting`/`setSetting`, `SETTING_KEYS`/`SETTING_DEFAULTS` constants), `lib/actions/settings.ts` (`saveSettings` admin-only — updates businesses.name + upserts app_settings), `SettingsForm` (General: name+address+phone; P&L: home_expense_in_pnl toggle default OFF; Defaulters: defaulter_days default 20), `app/(app)/settings/page.tsx`
  - Sidebar: added top-level "Settings" entry (admin only)
- **Notes:**
  - **businesses.name is the canonical source** for the switcher / PDFs; address + phone live in `app_settings` since the businesses table doesn't have those columns. Settings form updates both atomically.
  - **Receipts bucket is private** (Supabase signed URLs only). Path always starts with `business_id/` so the RLS policy can scope by `user_has_business((storage.foldername(name))[1]::uuid)`.
  - **Loan party** can be either an existing customer (combobox) or free text (e.g. "Brother", "Bank XYZ"). When customer-mode is used, the form passes the customer name to `party_name` and stores `party_customer_id` for future cross-link (column not yet in schema — currently ignored server-side; safe additive change for later).
  - **Settings audit trigger** logs every UPSERT to `app_settings` via the existing `log_audit()` function (writes to `audit_log`).
  - **Phase 2 (Core Modules) is now complete** — pieces 4-8 all done.

### Session 7 — 2026-05-10
- **Worked on:** Piece 7 — Payments + Ledger
- **Done:**
  - `0031_customer_ledger_rpc.sql` — `customer_ledger(p_customer_id)` RETURNS TABLE with `running_balance` computed via `SUM(debit−credit) OVER (ORDER BY ...)`. Includes synthetic Opening Balance row first. SECURITY DEFINER + explicit `user_has_business()` check.
  - `lib/validators/payment.ts` (zod, paymentMethods enum), `lib/actions/payment.ts` (`createPayment` — auth, business scope, customer verify, insert → trigger fires ledger credit, optional invoice paid/status update; `softDeletePayment` admin-only with reason)
  - `lib/queries/payments.ts` (`usePayments(filters)` + `useDeletePayment`), `lib/queries/customer-ledger.ts` (`useCustomerLedger`)
  - `components/payments/PaymentForm.tsx` (customer combobox reused from invoices, amount Rs.→paisa, Karachi-today date default, 4-method picker, reference + notes, new-balance preview). Pre-selects customer when navigated with `?customer=<id>`.
  - `components/payments/PaymentTable.tsx` (TanStack Table v8: date range default 30d, search by customer/ref/invoice, method pill multi-select, total-in-range footer, soft-delete dialog with reason for admin)
  - `components/customers/CustomerLedger.tsx` (tab on customer detail). Date range default = this month. Computes Brought Forward client-side from window-balance of last hidden row. "Print Statement" → PDF via `next/dynamic`-loaded `PDFDownloadLink`.
  - `components/customers/CustomerStatementPDF.tsx` (react-pdf statement layout with rows + closing balance, supports negative/credit)
  - `components/customers/CustomerDetailTabs.tsx` (Details / Ledger toggle)
  - Refactored `app/(app)/customers/[id]/page.tsx` to fetch business name and pass to tabs
  - `app/(app)/payments/page.tsx`, `app/(app)/payments/new/page.tsx`
- **Notes:**
  - **Running balance is NEVER stored** for client display. The `ledger_entries.balance_paisa` column captured at trigger time is unused by the UI; the RPC's window function is the single source of truth.
  - **Invariant verified end-to-end via SQL**: `Σ(opening_balance) + Σ(invoice debits) − Σ(payment credits) − Σ(return credits)` = `Σ(per-customer closing balance from window query)`. **Diff = 0.**
  - **Soft delete payment does NOT reverse the ledger credit** (matches invoice soft-delete semantics; documented in inline UI warning). Future post-MVP: optional offsetting adjustment flow.
  - PaymentForm uses `useSearchParams` so the new-payment page is wrapped in `<Suspense>` (Next 16 requirement for searchParams in client components).
  - `customer_ledger` returns the synthetic Opening row using `customer.created_at::DATE` as `entry_date` so it always sorts first via the `sort_key=0` tiebreaker.
  - **Customer detail page now has tabs** (Details / Ledger). Edit form moved into the Details tab.

### Session 6 — 2026-05-10
- **Worked on:** Piece 6 — Invoicing + Returns (all 5 steps)
- **Done:**
  - Step 1 — `lib/validators/invoice.ts`, `lib/invoice.ts` (pure `computeInvoiceTotals`), `lib/actions/invoice.ts` (`createInvoice` server action), `lib/actions/invoice.test.ts` (17 unit tests passing), `0020_invoice_rpc.sql` (`create_invoice_atomic` RPC, SECURITY DEFINER for purchase_price snapshot)
  - Live RPC test via `scripts/test-create-invoice.mjs` — uncovered + worked around the broken @koc.test users (added 0021/0024/0026/0028/0029 + new auth identities + email rename), root cause for seeded users still unresolved (deferred). Created `owner@khaliqoil.com` as the working test admin.
  - Step 2 — `lib/queries/invoices.ts` (`useInvoices`), `components/invoices/InvoiceTable.tsx` (TanStack Table v8 — added `@tanstack/react-table`), `app/(app)/invoices/page.tsx`. Filters: date range (default 30d), customer search, status pills, pagination 20/page.
  - Step 3a — `lib/queries/customers-balance.ts` + `CustomerCombobox.tsx` + `InvoiceForm.tsx` skeleton + `app/(app)/invoices/new/page.tsx`. Customer picker shows live balance per row; selected customer's outstanding balance highlighted in red.
  - Step 3b — `ProductCombobox.tsx` (search by name/SKU, stock + price per row); single line item row in form (qty, rate auto-fill, amount = qty × rate live).
  - Step 3c — Dynamic items (Add/Remove with last-row protection), Discount section (None/Fixed/Percent toggle), Totals (Subtotal/Discount/Net Total/Payment/New Balance). All math goes through `computeInvoiceTotals` from `lib/invoice.ts` — no inline arithmetic.
  - Step 3d — Submit handler wired to `createInvoice`; rate editing role-gated to admin only via `can()`; client-side stock warnings with admin override checkbox; redirect to `/invoices/[id]` on success; full TanStack Query cache invalidation.
  - Step 4 — `app/(app)/invoices/[id]/page.tsx` + `InvoiceDetail.tsx` + `InvoicePDF.tsx` (`@react-pdf/renderer` added). Actions: Print PDF (all roles), SMS/WhatsApp (placeholder), Mark Paid (admin/accountant — records payment for outstanding), Delete (admin only with required reason, prepended to notes). `lib/actions/invoice-detail.ts` for soft delete + mark paid. `lib/queries/invoice-detail.ts` for full invoice fetch with items/payments/returns.
  - Step 5 — `0030_return_rpc.sql` (`create_return_atomic` RPC: validates per-item qty against sold − already-returned, atomically inserts returns + return_items + stock_movements type='return'; ledger trigger fires credit). `lib/validators/return.ts`, `lib/actions/return.ts`, `lib/queries/return-form.ts`, `components/invoices/ReturnForm.tsx`, `app/(app)/invoices/[id]/return/page.tsx`.
- **Notes:**
  - **CLAUDE.md naming**: `invoice_number` (not `invoice_no`); confirmed via schema check.
  - **Soft delete invoice does NOT reverse the ledger**. Returns are the proper way to unwind. Documented in inline comments + UI ("file a return if you also need to reverse the customer's balance").
  - **Stock can go negative** when admin overrides — by design, matches the legacy app's flexibility for back-orders.
  - **PDF rendered client-side** via `next/dynamic` import of `PDFDownloadLink` to keep `@react-pdf/renderer` (~500KB) out of the initial bundle and skip SSR (it has browser-only APIs).
  - **Returns RPC is SECURITY DEFINER** because the validation needs to read across `invoice_items` and `return_items` regardless of caller's RLS. Caller must still belong to the business AND be admin/accountant — checked explicitly inside the function.
  - **invoice_items and return_items are immutable** (no UPDATE/DELETE policies). Corrections happen via new returns or new invoices.
  - **17 unit tests on computeInvoiceTotals** continue to pass after all UI was built. Form math wired to the same function — single source of truth, no duplication.
  - **DECISIONS.md ADR-015** added for the `*-shared.ts` pattern (Next 16 / Turbopack tightened tree-shaking on server-only modules; `lib/business-shared.ts` extracted from `lib/business.ts`).
  - **Build cleanly produces 14 routes**, 0 TS errors, 0 lint errors.

### Session 5 — 2026-05-09
- **Worked on:** Piece 5 — Customers + Products + Stock
- **Done:**
  - Sub-section A (Customers): `lib/validators/customer.ts`, `lib/actions/customer.ts`, `lib/queries/customers.ts`, `components/customers/{CustomerForm,CustomerTable}.tsx`, `app/(app)/customers/{page,new/page,[id]/page}.tsx`
  - Sub-section B (Products): `0018_view_grants.sql` (fixed `products_for_role` + `current_stock` views with business-isolation WHERE clauses + GRANT to authenticated), `lib/validators/product.ts`, `lib/actions/product.ts`, `lib/queries/products.ts`, `components/products/{ProductForm,ProductTable}.tsx`, product pages
  - Sub-section C (Stock): `0019_realtime.sql` (stock_movements in supabase_realtime publication), `lib/validators/stock.ts`, `lib/actions/stock.ts`, `components/stock/{AddStockModal,StockList}.tsx`, `app/(app)/stock/page.tsx`
- **Notes:**
  - Zod v4 API: `invalid_type_error` → removed, `.errors` → `.issues`
  - `products_for_role` and `current_stock` views needed WHERE clause added — both views previously lacked business isolation and GRANTs for authenticated role
  - purchase_price_paisa: NULL enforced at DB view level; staff/viewer confirmed absent from network response
  - Realtime: `postgres_changes` subscription on stock_movements invalidates products query cache; subscription filtered by business_id
  - Stock movements are immutable (no UPDATE/DELETE via RLS); adjustments use new rows
  - `canUpdate` (stock.update permission) and `canAdjust` (admin only) passed as server-resolved props

### Session 4 — 2026-05-09
- **Worked on:** Piece 4 — Multi-Business Switching
- **Done:**
  - `lib/business.ts`: `listAccessibleBusinesses()`, `getActiveBusinessId()` (cookie-based; layouts don't receive searchParams in Next.js App Router)
  - `lib/store/business.ts`: Zustand store with `hydrate()`, `setActive()`, `useActiveBusiness()`
  - `lib/actions/business.ts`: `switchBusiness()` server action — validates access, writes cookie, calls `revalidatePath`
  - `components/providers/QueryProvider.tsx`: TanStack Query client provider
  - `components/providers/BusinessProvider.tsx`: Hydrates Zustand store from server-resolved values
  - `components/layout/BusinessSwitcher.tsx`: Dropdown (multi), name-only (single), "Contact admin" badge (zero)
  - `Header.tsx` + `AppShell.tsx` updated to mount switcher and providers
  - `app/(auth)/no-access/page.tsx`: shown when user has no business access
- **Notes:**
  - `searchParams` not available in layouts — business switching uses cookies only on server side
  - Client-side URL `?b=` update handled in BusinessSwitcher after server action confirms access
  - `queryClient.clear()` on switch nukes all cached queries (data is business-scoped)

### Session 3 — 2026-05-09
- **Worked on:** Piece 3 — Scaffold + Shared UI + PWA
- **Done:**
  - `lib/money.ts` + 19 passing unit tests (vitest)
  - `lib/date.ts` (Karachi timezone helpers using date-fns-tz)
  - `lib/auth/session.ts` (getSession server helper)
  - `lib/supabase/middleware.ts` + `proxy.ts` (Next.js 16 renamed middleware→proxy)
  - `app/(auth)/layout.tsx` + `app/(auth)/login/page.tsx` (react-hook-form + zod)
  - `app/(app)/layout.tsx` + AppShell client wrapper
  - `components/layout/{Header,Sidebar,UserMenu,AppShell}.tsx`
  - Sidebar filters items via `can(role, permission)`; mobile collapsible
  - `app/(app)/dashboard/page.tsx` — 4 stat card placeholders
  - PWA: `next.config.ts` + `public/manifest.json` + placeholder icons 192/512
  - Root `app/layout.tsx` updated with manifest + viewport metadata
- **Notes:**
  - Next.js 16: `middleware.ts` renamed to `proxy.ts`, export renamed to `proxy`
  - Turbopack `root: __dirname` needed due to multiple lockfiles in parent dirs
  - `parsePKR` bug found + fixed in tests ("Rs. 500.50" was parsing as 0.50)

### Session 2 — 2026-05-09
- **Worked on:** Piece 2 — Auth + RLS
- **Done:**
  - `0017_rls_policies.sql`: RLS enabled on all 20 tables; 80 policies covering select/insert/update/delete; `public.user_has_business()` helper
  - `products` base table: staff/viewer see 0 rows; must use `products_for_role` VIEW
  - `lib/auth/permissions.ts`: PERMISSIONS map + `can(role, permission)`
  - `lib/auth/guards.ts`: `requireAuth()`, `requireRole(...roles)`
  - `lib/supabase/server.ts`: SSR server client (@supabase/ssr)
  - `lib/supabase/client.ts`: browser client
  - `lib/supabase/admin.ts`: service role client with browser-import guard
  - `supabase/tests/rls_smoke.sql`: 7 smoke test cases
  - All smoke tests passed; TypeScript clean
- **Notes:**
  - `purchase_price_paisa` NULL via service key without JWT is expected (no auth.uid() context)

### Session 1 — 2026-05-09
- **Worked on:** Piece 1 — Database Schema + Seed Data
- **Done:**
  - `supabase init` + linked to cloud project `drqpqjsamguffwkxiilp`
  - 15 migration files written (0001–0015), 1,098 lines total
  - Seed: 5 users, 4 businesses, 11 user_business links, 3 categories, 50 customers, 30 products, 230 stock movements, 100 invoices, 200 invoice items, 30 payments, 20 expenses, 130 ledger entries, 385 audit rows, 12 app_settings rows
  - All pushed to Supabase cloud and verified
- **Notes:**
  - `public.user_role()` moved from `auth` schema (no permission on cloud)
  - Seed uses pre-hashed bcrypt; do NOT push 0016_seed.sql to production
