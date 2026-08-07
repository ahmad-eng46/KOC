# MEMORY.md

> Living document of project state. Update at the end of every working session.
> Keep entries concise. Past entries archived to `docs/memory-archive.md` quarterly.

---

## Current Phase

**Phase 1 — Foundation & Database** ✅ COMPLETE
**Phase 2 — Core Modules** ✅ COMPLETE
**Phase 3 — Reports & Communication** ✅ COMPLETE (Piece 10 deferred pending Twilio/WhatsApp creds)
**Phase 4 — Launch** 🔨 IN PROGRESS (Piece 14 prep package built; execution blocked on external prereqs)
**Piece in progress:** None
**Next piece:** Piece 14 — Production Deployment (blocked on 5 external prereqs — see `docs/deployment/runbook.md` Section 1)

---

## Quick Status

- [x] Planning complete
- [x] CLAUDE.md / MEMORY.md / DECISIONS.md created
- [x] Supabase project created (ref: drqpqjsamguffwkxiilp, region: Singapore)
- [x] Vercel project created (live at https://koc-chi.vercel.app)
- [x] GitHub repo created and pushed (github.com/ahmad-eng46/KOC)
- [x] First commit
- [x] Database schema deployed (15 migrations applied)
- [x] RLS policies live (0017_rls_policies.sql)
- [x] Auth working (login page + session + proxy)
- [x] First feature shipped (dashboard placeholder)
- [x] PWA configured (manifest + icons)

---

## Last Session

**Date:** 2026-08-08 (session 18, same day as 16/17)
**Worked on:** Product brand/supplier system — brands table + products.brand_id, filter chips + badges + bulk assignment on the products list, brand picker with quick-create on the product form, /settings/brands management, and the owner's key deliverable: per-brand stock report PDF/Excel with the REORDER NEEDED block.
**Completed:** 0044 migration (brands, products.brand_id, products_for_role replaced to expose it, brand_summary_view over current_stock, narrow assign RPCs), validators/actions/hooks, all UI phases, exports (previews rendered + eyeballed), backup Brands sheet + Products Brand columns. 118 tests green, next build green.
**Blocked by:** Migrations **0039–0044 are NOT applied to Supabase** — same credential gap as 0037/0038. Until applied, the new brand/expense/location/supplier features error on missing tables/columns.
**Next:** Apply 0037–0044 to the cloud DB, rotate the `owner@khaliqoil.com` password (`KocTest2024!` is in the repo and the app is now public)

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
- [x] **Piece 12** — Backup System _(in-app + Edge Functions written, pg_cron deployment pending)_

### Phase 4: Launch
- [x] **Piece 13** — Data Migration from .mdf _(migrator built + dry-run validated against sample CSVs; awaits real .mdf export for confirmed run)_
- [ ] **Piece 14** — Production Deployment
- [ ] **Piece 15** — Training + Handover

---

## Known Blockers

- **Piece 14 (Production Deployment):** blocked on 5 external prereqs — see `docs/deployment/runbook.md` Section 1.
  1. Domain not purchased (open question: `khaliqoil.com` or alternative?)
  2. `koc-prod` Supabase project not created (dev project `drqpqjsamguffwkxiilp` exists; prod must be a separate project)
  3. Resend account + API key not provisioned (also blocks email backups in Piece 12)
  4. Twilio account + production credentials not provisioned (also blocks SMS in Piece 10)
  5. Meta WhatsApp Business verification not started (2–5 business day wait once submitted; also blocks WhatsApp in Piece 10)
- **Piece 10 (SMS + WhatsApp):** blocked on prereqs 3 and 5 above.

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
- **Customer balance query** (`lib/queries/customers-balance.ts`) fetches all `ledger_entries` for the active business and sums `debit - credit` per customer client-side. The server-side `customer_balances_view` now exists (migration 0042, used by the location pages) — remaining work is just pointing `useCustomersWithBalance` / `useCustomerReport` at it. Note the client-side path silently shows opening-balance-only numbers for staff/viewer (ledger RLS); the view shows true balances to all roles.

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

### Session 19 — 2026-08-08
- **Worked on:** Invoice-PDF full-balance spec (round 2 — the feature itself shipped in fb2ef92/session 15; this closed the deltas), commits `9deeb4f`…`168c483`.
- **Totals math:** `computeInvoiceTotals` gains `hasCreditPrevious` / `isCreditBalance`; 10 tests incl. the spec's credit-previous subtraction (−5,000 + 85,000 → 80,000 due), the 1,75,000-paid → 25,000 Credit Balance case, khata (zero-payment) and fully-settled-zero.
- **PDF:** labels aligned ("Total Amount Due", "Remaining Balance"); overpaid renders green **Credit Balance** with the absolute amount; negative previous renders green **"Credit from previous"** with explicit minus. Fixed in passing: the Discount row's U+2212 minus (silently dropped by Helvetica/WinAnsi, found session 15) → ASCII '-'. Preview script gained overpaid + khata fixtures; credit cases eyeballed against the spec mockups.
- **On-screen invoice detail** (was never updated in session 15): header card and table footer now run through the same `computeInvoiceTotals` — the misleading "Balance Due Rs. -15,000" is gone from the screen too; Mark Paid still uses the invoice-scoped outstanding.
- **Consistency:** `useCustomersWithBalance`, `useCustomerReport` (→ receivables aging) and `useDefaulters` migrated to `customer_balances_view` — closes the divergence where staff/viewer saw zero/opening-only balances from client-side ledger sums under RLS, and finishes the customers-balance.ts tech-debt item. `CustomerWithBalance` dropped unused `opening_balance_paisa`.
- **Process note:** caught a piped-exit-code trap (`eslint | tail` reports tail's exit) that let 2 pre-existing unescaped-entity errors slip into a commit — fixed + amended; check exit codes unpiped.
- **Verified:** 122/122 vitest, tsc clean, ESLint 0/0 on touched files, next build green, PDFs eyeballed.

### Session 18 — 2026-08-08
- **Worked on:** Product brand/supplier system. Commits `6517978`…`0155c93` (9 commits).
- **DB (0044):** `brands` (multinational | local_dealer, contact fields, sort_order; case-insensitive unique per business) + nullable `products.brand_id`. **`products_for_role` REPLACED to expose brand_id** — the view enumerates columns, so without this even admin's list (which reads the view) would never see it. `brand_summary_view` joins `current_stock` (the app's one stock computation) — out = on-hand ≤ 0 (incl. no-movement products), low = 0 < on-hand ≤ threshold, non-overlapping. Assignment via narrow SECURITY DEFINER RPCs (`assign_product_brand` admin/accountant/staff; `assign_products_brand` bulk admin/accountant) because products UPDATE RLS is admin-only *to guard price fields* — these touch only brand_id (the 0042 location-assign pattern). 8 assertion groups on scratch PG incl. staff-sees-brand-but-NULL-cost through the view.
- **Server/hooks:** brands validators (phone refine = customers' PK regex), CRUD actions (deleteBrand soft-deletes + moves products to Unbranded via the bulk RPC, returns count), `useBrands` (summary view + base row merge, one query), `useProducts(brandId?)` enhanced with 'unbranded' sentinel (old no-arg call unchanged), `useProductsByBrand` wrapper.
- **UI:** ProductForm gains grouped BrandPicker (Multinationals / Local dealers sections, green "+ Add new brand" → 2-field quick-create sheet that auto-selects). Products list: 44px filter chips (All / brands / Unbranded with amber count badge), state in `?brand=` URL param, brand-aware search ("double" finds Double Horse products), purple/coral badges, amber unbranded banner → bulk-assign mode (checkboxes, sticky top bar desktop / bottom bar mobile, stays on page batch after batch). /settings/brands: cards with type badge, tel: links, view-fed stats, full edit sheet, admin delete with "N products will become unbranded".
- **Exports (the owner's daily tool):** `lib/actions/brand-stock-report.tsx` reads products_for_role **with the caller's auth context** so staff/viewer cost is NULL at the DB and the column is omitted entirely from PDF+Excel. Pure status/sort/summary logic in `lib/brand-stock.ts` (5 tests; at-threshold = low, threshold 0 = never low, negatives clamp). PDF: red REORDER NEEDED block ("OUT OF STOCK" / "only 3 left"), PKT timestamps, lakh prices; all-brands = summary page + page per brand + combined reorder grouped by brand. Excel: Stock Report + Reorder List sheets, status cell fills, all-brands = Summary + sheet per brand. **Two bugs caught only by rendering previews:** U+26A0 (⚠) silently dropped by Helvetica/WinAnsi (→ "!"), and Stock/Unit columns visually merging (→ padding). scripts/render-brand-stock-preview.tsx renders admin/staff/all variants.
- **Backup:** Brands sheet both generators; Products sheet gains Brand ID + looked-up Brand name with a new `fallback` option on the lookup mechanism ('—' for unbranded). The "Sheet Count column C bug" spec-claimed for the third time — still non-existent (re-confirmed; count is dynamic).
- **Verified:** 118/118 vitest, tsc clean, ESLint 0/0 on touched files, next build green (all routes), 8 SQL assertion groups, three PDFs eyeballed.
- **⚠️ Not applied:** 0044 (and 0039–0043) not pushed to Supabase — no DB credentials in session.

### Session 17 — 2026-08-08
- **Worked on:** Smart expense categorization with asset tracking. Commits `246ca90`…`818f0af` (8 commits).
- **formatPKR now uses the Pakistani number system** (`246ca90`): `toLocaleString('en-PK')` produces WESTERN grouping in V8 (150,000 not 1,50,000) — verified empirically, so grouping is manual (last 3 digits, then pairs), deterministic across server PDFs and browsers. This changed every money display app-wide; one old test assertion (999,999.99 → 9,99,999.99) encoded the removed behaviour and was updated. 25 money tests.
- **DB (0043):** `expense_assets` (JSONB details) + `expense_sub_types`, both CHECK-pinned to the 8 fixed categories, case-insensitive unique per (business, category, name). `expenses` gains NULLABLE `asset_id`/`sub_type_id`/`asset_name`/`sub_type_name` — old rows untouched. **Denormalisation + category-match validation live in a BEFORE trigger** (`fn_expenses_denormalize`), not just the action. **Transport+Maintenance are one category group** (`expense_category_group()` SQL + mirrored TS in `lib/validators/expense-assets.ts` — keep in sync): a car's petrol and oil change attach to the same asset; a Rent expense on a car is rejected. Vehicle sub-types seeded under Transport ONLY (group rule exposes them to Maintenance; double-seeding would duplicate dropdowns). 29 defaults per existing business — later businesses start empty. `expense_asset_summary_view` = per (type, category, asset, sub-type, month) rollup; names fall back to the denormalised snapshot after asset soft-delete. 9 assertion groups on scratch Postgres 16.
- **Form:** prefetch-once hooks (`useExpenseAssets`/`useExpenseSubTypes` fetch all, filter client-side per category group) so the progressive Asset/Expense-Type fields never spin. AssetPicker (searchable, "+ Add New" pinned), AddAssetSheet (bottom sheet; type chips per category; plate/fuel for vehicles; also does EDIT mode for the settings page), inline instant sub-type add. Category change resets both fields **unless the change stays inside Transport↔Maintenance**. Both fields optional; old flow byte-identical.
- **List:** category chips → asset chips (group-aware) → period presets → Business/Home; asset+sub-type badges on rows; List / "By Item" grouped view (collapsible per-asset sections, totals, Untracked last). **Selecting a concrete asset drops the category filter** on purpose — an asset's view must span Transport+Maintenance.
- **Analytics (/reports/expenses):** all math in `lib/expense-analytics.ts` — pure, `now`-injected, **14 unit tests** (period boundaries, category merge, untracked bucketing, share capping, zero-filled trend, %-change edges). Cards / sortable period-column table with expandable sub-type rows + Compare checkboxes / 12-month trend bar / capped donut (5+Other, labelled list) / two-asset comparison. Charts use the dataviz-skill reference palette, validated with its script; PDF component in `components/reports/expense-pdfs.tsx` (NOT the 'use server' module, so `scripts/render-expense-report-preview.tsx` can render it — done, eyeballed: lakh grouping + merged categories correct). Exports: PDF (summary + page per item) and Excel (Summary + sheet per category).
- **Settings (/settings/expense-assets):** tabs per category GROUP (Vehicles = Transport+Maintenance), asset cards w/ Total Spent + This Month, edit/delete (delete warns with linked count; history keeps names), collapsible sub-type management. Accountants reach it via "Manage Items" on /expenses (Settings sidebar entry stays admin-only).
- **Backup:** Expense Assets + Expense Sub-types sheets in both generators; Expenses sheet gains Item/Expense Type/id columns.
- **Deviations (documented in commits):** the spec's "staff can create expenses" contradicts CLAUDE.md's fixed permission matrix (staff have no expenses.*) and existing RLS/pages — kept admin/accountant per CLAUDE.md's precedence, flagged to owner. The "Sheet Count column C bug" remains non-existent (re-verified session 16). Analytics/report gated admin/accountant to match the module.
- **Verified:** 113/113 vitest, tsc clean, ESLint 0/0 on touched files, next build green (all new routes), migration assertions green.
- **⚠️ Not applied:** 0043 (and 0039–0042) not pushed to Supabase — no DB credentials in session.

### Session 16 — 2026-08-08
- **Worked on:** Supplier (vendor) management + Location/city customer categorization, both complete DB→UI. Commits `895b021`…`8fc9feb`.
- **Suppliers** (0040, 0041):
  - `suppliers` / `stock_purchases` / `supplier_payments` tables, `supplier_balance_view` (purchased − paid; subquery aggregation to avoid row multiplication), `stock_movements.stock_purchase_id`, `create_stock_purchase_atomic()` (purchase + 'in' movement + `products.purchase_price_paisa` update in one txn; recomputes total server-side), `supplier_ledger()` RPC (window-function running balance, admin/accountant only).
  - **Iron rule #3 extended to the buy side:** base tables SELECT-able by admin/accountant only; staff read `stock_purchases_for_role` which NULLs money columns. Staff can *create* purchases (delivery in hand) but never browse cost or pay vendors. UI additionally hides price columns / Payments / Ledger tabs / balance card for them.
  - `stock_purchases.quantity` is NUMERIC(12,3), **deliberately not the spec'd INTEGER** — must round-trip into `stock_movements.quantity` (litres). `total_paisa` CHECK-constrained to `ROUND(qty × unit_price)`.
  - `purchaseTotalPaisa()` in `lib/supplier-totals.ts` previews the modal total; verified byte-identical with Postgres `ROUND()` across 14 cases (both operands positive ⇒ half-up == half-away-from-zero). 13 unit tests.
  - Add Stock now interposes "Purchase from supplier / Manual adjustment" chooser for roles with `purchases.create`; old flow untouched otherwise. Product page gains Purchase History. Sidebar: Suppliers (Truck) for admin/accountant/staff (viewer keeps URL access, read-only — NavItem got a `roles` list).
  - New shared primitives: `ToastProvider`/`useToast` (app had none), `components/ui/form-fields.tsx` (Field/ServerError/inputCls extracted from 3 duplicating forms).
- **Locations** (0042):
  - `locations` (case-insensitive unique name per business), `customers.location_id` (nullable, never forced), `assign_customer_location()` (staff allowed — SECURITY DEFINER because `customers_update` RLS is admin/accountant; widening RLS would hand staff every field), `assign_customers_location()` bulk (admin/accountant, single-business enforcement, returns count).
  - **`customer_balances_view`** — pays down the tech-debt note below: server-side `opening + SUM(debit−credit)` with the exact `reports.ts` semantics; visible to ALL roles (sale-side money ≠ purchase prices; owner-view bypasses ledger RLS deliberately). `location_summary_view` on top; `total_outstanding_paisa` sums **positive balances only** so an overpaid customer can't mask a city's dues.
  - UI: /locations hub (2-up tappable city cards in route order + amber Unassigned card), /locations/[id] (chips All/Has Dues/Cleared/Overpaid, rupee min/max pushed down to SQL, 4 sorts, tap-to-call, sticky totals footer; reserved id `unassigned`), /locations/assign (multi-select + FAB + bottom-sheet on mobile). Customers list gets location filter + badge column; customer form gets Location select; sidebar Locations (MapPin) above Customers for all roles.
  - /reports/locations (admin/accountant — ledger RLS would zero it for staff/viewer): summary + per-city breakdown pages in PDF, summary + per-city sheets in Excel (sheet names sanitised, 31-char limit, dedupe).
  - Backup: Locations/Suppliers/Stock Purchases/Supplier Payments sheets in both generators; Customers sheet gains Location ID + looked-up Location name (new `lookup` mechanism in SheetSpec).
- **Bugs fixed in passing:** CustomerForm's "— None —" category select submitted `''` which `uuidLike().nullable()` rejects — every customer saved without a category failed validation; both selects now `setValueAs` `'' → null`. Dropped unused `clsx` (CustomerTable) and `can`/`formatPKR` (reports actions) imports.
- **Spec deviations (deliberate, documented in commits):** purchase quantity NUMERIC not INTEGER; supplier list balance colors (red = we owe — liability, mirror of customer table); previous-balance "Sheet Count column C bug" **does not exist** (verified via xlsx round-trip: `getCell('value')` → B5, count already dynamic); location outstanding uses `GREATEST(balance,0)`; location report gated admin/accountant.
- **Verifications:** every migration + RLS asserted on scratch Postgres 16 with role-switching harness (13 supplier groups incl. 42501 staff denials; 8 location groups; supplier assertions re-run green after 0042). `tsc --noEmit` clean, ESLint 0/0 on all touched files, 93/93 vitest, `next build` passes with all new routes. Location PDF rendered and eyeballed; totals cross-checked in SQL.
- **⚠️ Not applied:** 0040–0042 not pushed to Supabase (no DB credentials in session — same as 0037–0039).

### Session 15 — 2026-07-31
- **Worked on:** Invoice PDF now shows the customer's full account position (previous balance → total due → real balance due), not just the current invoice.
- **Files added:**
  - [supabase/migrations/0039_invoice_previous_balance_rpc.sql](supabase/migrations/0039_invoice_previous_balance_rpc.sql) — `invoice_previous_balance(p_invoice_id)` returns BIGINT paisa. `SECURITY DEFINER` + `user_has_business()` check, same shape as `customer_ledger()`. Sums opening balance + all ledger entries sorting strictly before the invoice's own ledger row, using the **same ordering key as `customer_ledger()`** — `(entry_date, created_at)`. Payments against this invoice sort after it and are excluded by construction.
  - [lib/invoice-totals.ts](lib/invoice-totals.ts) — pure `computeInvoiceTotals()`, all math in integer paisa.
  - [lib/invoice-totals.test.ts](lib/invoice-totals.test.ts) — 6 tests incl. the spec's worked example (86k/1k/85k + 65k prev → 150k due − 100k paid → 50k).
  - [scripts/render-invoice-pdf-preview.tsx](scripts/render-invoice-pdf-preview.tsx) — renders InvoicePDF to disk with fixtures; makes PDF layout changes checkable without auth or a browser.
- **Files modified:**
  - [lib/queries/invoice-detail.ts](lib/queries/invoice-detail.ts) — `previous_balance_paisa` added to the existing `Promise.all` (no extra round-trip), zod-validated at the boundary since supabase-js may surface BIGINT as string or number.
  - [components/invoices/InvoicePDF.tsx](components/invoices/InvoicePDF.tsx) — conditional totals block.
- **Decision:** show/hide threshold is `previousBalance !== 0`, not `> 0` as originally specced. A *credit* balance (customer overpaid) would otherwise fall into the simple view, where "Balance Due" overstates what's owed. Zero case renders byte-identical to the old layout.
- **Degradation:** a null previous balance (RPC missing/erroring) falls back to the simple view rather than printing a wrong number.
- **Verifications:** `tsc --noEmit` clean; 80/80 vitest pass; ESLint clean on all touched files (repo-wide `pnpm lint` was already failing beforehand — unescaped entities + `any` in `supabase/functions/`, untouched). PDF rendered to disk and visually checked for all four cases. SQL verified against a throwaway local Postgres 16 DB with 5 assertions: correct previous balance, opening-only for first invoice, draft-invoice fallback, NULL for unknown/deleted, and non-member blocked with `Not authorised`. Scratch DB dropped.
- **⚠️ Not applied:** migration 0039 is **not** pushed to Supabase (Docker wasn't running, so no local stack). Until applied, the RPC 404s and every invoice renders the simple view — no crash, but the feature is inert.

### Session 14 — 2026-05-11
- **Worked on:** Codebase audit fix — added role gates to `createCustomer` / `updateCustomer` / `createProduct` / `updateProduct` per Check #5 of the post-Piece-14-prep audit. Defense in depth restored. RLS still in place as second layer.
- **Files modified:**
  - [lib/actions/customer.ts](lib/actions/customer.ts) — `createCustomer`, `updateCustomer` now call `requireAuth()` then `can(profile.role, 'customers.create' | 'customers.update')` and throw `Permission denied: …` on failure. Existing zod + business-scope checks unchanged.
  - [lib/actions/product.ts](lib/actions/product.ts) — `createProduct`, `updateProduct` got the same treatment with `'products.create'` / `'products.update'`.
- **Pattern:** auth gate (redirects on no session) → role gate (throws) → schema validation → business scope → DB write. All four functions follow the same fail-fast order.
- **Verifications:** `pnpm tsc --noEmit` clean, `pnpm vitest run` 48/48 pass. Live browser viewer-fetch test deferred (requires running session). `can()` matrix manually traced from `lib/auth/permissions.ts:35-82` against all 16 (role × permission) combinations: admin ✅ all, accountant ✅ customers/❌ products, staff ✅ customers.create only/❌ rest, viewer ❌ all four — matches intended denial behavior.
- **Call sites:** Only `components/customers/CustomerForm.tsx` and `components/products/ProductForm.tsx` invoke these actions. Both forms are reached via routes already restricted to admin/accountant, so the throw path is unreachable in normal UI — gates are pure defense in depth against direct API construction.
- **Note:** The new `throw` deviates from the existing `{ ok: false, error: '…' }` return shape for permission failures only. This is per spec (fail-fast). Authenticated-user/business-scope failures still use the soft-return shape. Forms don't currently render specific UI for the thrown error — it'll bubble as an unhandled server-action error to the client. Acceptable since legitimate UI flow can't reach the throw.

### Session 13 — 2026-05-11
- **Worked on:** Piece 14 — Production Deployment (prep package only, no production touch)
- **Files added:**
  - `docs/deployment/vercel-env-vars.md` — env-var inventory grepped from `process.env.*` (Next.js) and `Deno.env.get(*)` (Edge Functions) references in the codebase. Splits into Required-today (3 vars), Recommended (3), Forward-looking (8 — Twilio/WhatsApp/Backblaze; gated until corresponding piece is wired), and Edge-Function-secrets (set via `supabase secrets`, not Vercel). Each row: example shape, source dashboard, what breaks if missing.
  - `docs/deployment/runbook.md` — 13-section launch runbook with per-step commands, click paths, time estimates, and "If this fails" troubleshooting. Sections: external prereqs → migrations → admin user → Resend → Twilio → WhatsApp → Vercel deploy → custom domain → UptimeRobot → Backblaze (optional) → security checks → smoke test (12 numbered checks for owner-on-iPhone) → rollback procedure.
  - `docs/deployment/security-checklist.sh` — executable bash. Six check sections: (1) service_role not in committed source outside `lib/supabase/admin.ts` and not in `.next/static`; (2) no hard-coded supabase.co URLs or JWT-shaped tokens in source; (3) `.gitignore` contains `.env` rule + no `.env` files tracked; (4) RLS enabled on every public table (via `supabase db query`, gracefully WARNs if CLI not linked); (5) `.next` build current vs newest source file; (6) optional Lighthouse audit (≥90 perf/accessibility/best-practices) when `--staging-url` provided. Coloured PASS/FAIL/WARN output, exits 0 only when zero FAILs. **Verified locally: 8 PASS / 0 FAIL / 2 WARN (legitimate skips: Supabase not linked here, no staging URL).**
  - `docs/deployment/dns-cheat-sheet.md` — every DNS record needed at the registrar. Sections: Vercel (A + CNAME), Resend (SPF + DKIM + return-path MX), DMARC (recommended), optional Workspace MX, CAA. Per row: type, host, placeholder value, TTL, dashboard source. Includes apply-order recommendation and `dig` verification commands.
- **Files modified:** `MEMORY.md` (this entry + Known Blockers section + Last Session block + phase header)
- **Verifications:** `docs/deployment/security-checklist.sh` ran cleanly against current repo (exit 0, 8 PASS / 0 FAIL / 2 WARN). 4 docs all renderable.
- **NOT done (intentional — blocked on external prereqs):**
  - No Supabase project named `koc-prod` was created (would cost the user free-tier slot + requires their explicit account-level provisioning)
  - No domain registered, no DNS records added, no Vercel project linked, no API keys generated
  - The `git push` at end of this session pushes the prep docs only; no production resource was touched
- **Notes:**
  - **Env-var inventory is grep-derived, not hand-written.** Used `grep -rEn "process\.env\.[A-Z_]+"` across `app/`, `components/`, `lib/`, `scripts/` to find every actual reference, then cross-referenced against the spec's expected list. Of the 14 vars the spec listed, **3 are required today** (Supabase URL/anon/service-role), **1 is partially used** (Resend, gates UI in `lib/backup/schedule.ts:47`), and **10 are forward-looking** (Twilio/WhatsApp not used until Piece 10 wires them; Backblaze not used until the destination is added to `scheduled-backup` Edge Function). The doc clearly distinguishes Required vs Forward-looking so the user doesn't waste time provisioning Twilio creds before Piece 10 is built.
  - **Runbook accounts for the `0016_seed.sql` gotcha** — that file contains the dev test users with a known password (`KocTest2024!`) and `0017_rls_policies.sql` references those users. Section 2 explicitly tells the user to rename `0016_seed.sql` to `.skip` before pushing to prod, then create the bootstrap admin manually in Section 3.
  - **Security script is conservative on RLS check** — uses `supabase db query` to compare `pg_tables` against `pg_class.relrowsecurity`. If `supabase` isn't linked, it WARNs (not FAILs) so the script stays runnable in any environment.
  - **DNS cheat sheet flags the single-SPF-record gotcha** — many users add Resend's SPF, then later add Workspace's SPF, and silently break delivery because only one TXT SPF record can exist at the apex. The doc shows the merged form: `v=spf1 include:_spf.google.com include:amazonses.com ~all`.
  - **Lighthouse check uses `npx lighthouse` directly** (no permanent dev dep added) — only runs when user passes `--staging-url`, so no impact on CI/local.

### Session 12 — 2026-05-11
- **Worked on:** Piece 13 — Data Migration from legacy SQL Server `.mdf`
- **Files added:**
  - `migration_data/README.md` — drop-folder docs: filenames, expected columns per CSV, conventions (money × 100 → paisa, Karachi → UTC, single auto-created `Legacy` business, skipped tables `Ladger_Table` + `Profit_Table`)
  - `migration_data/Customer_Table.csv`, `Product.csv`, `Stock_Table.csv`, `Invoice_Table.csv`, `Invoice_Table1.csv`, `Cash_Table.csv`, `Expense_Table.csv`, `Investment_Table.csv`, `Loan_Table.csv`, `Login.csv` — sample CSVs mirroring legacy WinForms schema; include edge cases (negative opening balance, missing purchase price, orphan invoice with bad customer FK, payment with no invoice, user with no password)
  - `scripts/migrate.ts` — single-file migrator (~750 LOC). Phases: load → plan → optional write → report. Default mode is `--dry-run`; explicit `--confirm` writes via service-role Supabase client. Mappings:
    - `Customer_Table` → `customers` (with auto-created `Legacy` business)
    - `Product` → `products` (purchase_price NULL → 0 + anomaly flag)
    - `Stock_Table` → `stock_movements` type='in'
    - `Invoice_Table` + `Invoice_Table1` → `invoices` + `invoice_items` (joined by `InvoiceID`); also generates type='out' stock_movements per line item; status derived from paid vs total
    - `Cash_Table` → `payments` (PayMethod normalized to enum; orphan invoice ref → on-account payment + anomaly)
    - `Expense_Table` → `expenses` type='business'
    - `Investment_Table` → `investments`
    - `Loan_Table` → `loans` (Direction Given/Taken validated; Status → is_settled)
    - `Login` → auth.admin.createUser (re-hashes password via bcrypt; null passwords get generated `Tmp-<hex>!` and are surfaced in report)
    - **Skipped intentionally:** `Ladger_Table` (regenerated by ledger trigger), `Profit_Table` (computed by P&L report)
- **Files modified:**
  - `package.json` — added `csv-parse` + `tsx` devDeps; added `migrate` script (`tsx --env-file=.env.local scripts/migrate.ts`)
- **Outputs:**
  - `migration_report.md` (regenerated each run) — row counts source→target, sum receivables (legacy vs imported with diff), top-10 customers by balance side-by-side, skipped rows + reasons, anomalies, generated-password table, write errors (confirmed mode only)
- **Dry-run on sample CSVs:**
  - Loaded: 10 customers, 10 products, 12 stock movements, 10 invoices, 18 invoice items, 10 cash entries, 8 expenses, 3 investments, 3 loans, 4 logins
  - Planned: 10 / 10 / 12 / 9 / 16 / 10 / 8 / 3 / 3 / 4
  - **Sum receivables: legacy Rs. 68,445.50 ↔ imported Rs. 68,445.50, diff = 0.00 ✅**
  - **Top-10 customer balances: 10/10 ✅ exact match**
  - 3 skipped (orphan invoice with `CustomerID=99` and its 2 line items + 1 line item referencing missing invoice)
  - 2 anomalies (negative opening balance for Chaudhry Khan & Sons, missing purchase price on product 7)
  - 1 generated password (staff2 had no legacy password)
- **Verifications:** `pnpm tsc --noEmit` clean, `pnpm vitest run` 48/48 pass, `pnpm build` clean (36 routes — no UI route added)
- **Notes:**
  - **Default is dry-run** — `pnpm migrate` alone never writes. `--confirm` is required and additionally validates env vars before connecting.
  - **Run on a fresh Supabase project FIRST.** Sample-data `--confirm` was NOT executed against the cloud DB (already has Piece-1 seed data; would conflict on businesses/users). Real-data `--confirm` should target an empty project.
  - **Idempotency is intentionally NOT implemented.** Re-running `--confirm` will create a second `Legacy` business and duplicate everything. Production runbook: empty project → confirmed run → if it fails, drop project and retry. Mapping-table approach can be added later if needed.
  - **`process.cwd()` is used for path resolution** instead of `import.meta.dirname` because tsx loads the script as CJS where `import.meta.dirname` is undefined. `pnpm` always invokes from the package root, so cwd is reliable.
  - **Karachi → UTC** is applied only to TIMESTAMPTZ columns (`stock_movements.created_at`, etc.). `DATE` columns (`issue_date`, `payment_date`, `expense_date`) keep the legacy `YYYY-MM-DD` as-is — date-only values have no timezone.
  - **Receivables math invariant**: `Σ(opening) + Σ(invoice.total) − Σ(cash.amount)` per customer, computed identically from legacy CSVs and from the planned in-memory rows. The 0.00 diff confirms the transformation is lossless.
  - **Stock-out movements are auto-created** for each invoice line item so `current_stock` view reflects post-import balances correctly. Stock_Table provides the type='in' inflows; the migrator adds the type='out' outflows the legacy app stored implicitly.

### Session 11 — 2026-05-11
- **Worked on:** Piece 12 — Backup System (Excel + DB + scheduled).
- **Files added:**
  - `supabase/migrations/0036_backups_bucket.sql` — private `backups` Storage bucket + RLS scoped to `user_has_business` AND admin role; RLS on `public.backups` table (admin-only)
  - `lib/backup/generate-excel.ts` — server-only Excel builder. 14 sheets (customers, products, invoices, invoice_items, returns, return_items, payments, expenses, investments, loans, stock_movements, ledger_entries, sms_log, audit_log) + Meta sheet. Money columns formatted as `"Rs. "#,##0.00`. Date columns formatted. Service-role queries to capture deleted rows + audit_log. **invoice_items / return_items scope via parent** (no business_id column).
  - `lib/backup/schedule.ts` — frequencies (Off/1/3/5/7/15/30 days), destination types (email/gdrive/backblaze/whatsapp), `DESTINATION_AVAILABLE` map (only `email` is wired, gated by `RESEND_API_KEY` presence)
  - `lib/actions/backup.ts` — `runBackupNow` (creates row → builds → uploads → updates row), `getBackupSchedule`/`saveBackupSchedule`, `listRecentBackups` (last 10), `getBackupSignedUrl` (1h signed URL for download)
  - `components/settings/BackupPanel.tsx` — Backup Now button (downloads + uploads), Schedule UI, Recent Backups history
  - `app/(app)/settings/backup/page.tsx`
  - `supabase/functions/scheduled-backup/index.ts` — Deno Edge Function. Iterates app_settings rows, checks per-business cadence, generates Excel, uploads, optionally emails via Resend.
  - `supabase/functions/daily-db-dump/index.ts` — Deno Edge Function. Dumps every table as JSONL, tar+gzip, upload to `backups/db-dumps/`, prune > 30 days.
  - `scripts/test-excel-backup.mjs` — live smoke test
- **Files modified:** `tsconfig.json` (excluded `supabase/functions` so Deno-only files don't break Next's `tsc`)
- **Files modified:** `SETUP.md` appended with Edge Function deployment + pg_cron schedule snippets + cron expression cheat sheet
- **Live verification:** `scripts/test-excel-backup.mjs` ran against the cloud DB → built a 116 KB workbook with **1218 rows across 14 tables**: 50 customers, 30 products, 102 invoices, 204 invoice_items, 32 payments, 20 expenses, 234 stock_movements, 134 ledger_entries, 412 audit_log. Empty parent → empty child sheet handled cleanly.
- **Bug found and fixed during live test:** `invoice_items` and `return_items` have no `business_id` column. Initial generator naively `.eq('business_id', ...)` which 400'd. Fixed by pre-fetching parent IDs and scoping with `.in('invoice_id', [...])` / `.in('return_id', [...])`. Same fix applied to the Edge Function (which is Deno but mirrors the same logic).
- **Verifications:** `tsc --noEmit` clean, `vitest run` 48/48 pass, `pnpm build` clean (36 routes — `/settings/backup` added).
- **NOT done (deferred until explicit user authorization):**
  - `supabase functions deploy scheduled-backup` and `... daily-db-dump`
  - pg_cron schedule SQL (documented in SETUP.md, not executed)
  - Resend API key not in `.env.local` so email destination shows "Coming soon" until provisioned
- **Push rule still in effect:** user said `5675` is the only authorization for `git add/commit/push`. This piece is fully built locally but not committed. Status: `M MEMORY.md, M tsconfig.json, M SETUP.md, ?? lib/backup/, ?? lib/actions/backup.ts, ?? components/settings/BackupPanel.tsx, ?? app/(app)/settings/backup/, ?? supabase/migrations/0036…, ?? supabase/functions/, ?? scripts/test-excel-backup.mjs`.

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
