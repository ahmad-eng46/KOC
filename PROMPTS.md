# PROMPTS.md

> Battle-tested prompts for Claude Code, one per build piece.
>
> **How to use:**
> 1. Open Claude Code in VS Code
> 2. Find the piece you're working on
> 3. Copy the prompt **exactly** (or adapt the variables marked `[LIKE_THIS]`)
> 4. Paste into Claude Code
> 5. Review the output critically — don't blindly accept
> 6. Run the verification step before moving to the next piece
>
> **Universal advice for every prompt:**
> - Claude Code automatically reads `CLAUDE.md`. Don't repeat its rules.
> - Always end with "follow the conventions in CLAUDE.md" as a safety net.
> - If output is too big, ask Claude Code to break it into smaller commits.

---

## Session-Start Prompt (use every session)

```
Read CLAUDE.md and MEMORY.md. Summarize:
1. The current phase and the next piece.
2. The most recent decision in DECISIONS.md.
3. Any open TODOs in MEMORY.md that block the next piece.

Do not write code yet. After your summary, wait for me to confirm before starting work.
```

This ensures Claude Code is grounded before you ask it to do anything destructive.

---

## Piece 1: Database Schema + Seed Data

**Goal:** Create the full Postgres schema in Supabase migrations + seed data for development.

### Prompt 1.1 — Schema design

```
We are building Piece 1: Database Schema + Seed Data.

Create Supabase migration files under `supabase/migrations/`. Use the timestamp-prefixed naming convention (e.g. 20260507120000_create_users.sql). One migration per logical group of tables.

Create the schema in this order:
1. 0001_extensions.sql — enable pgcrypto for UUIDs
2. 0002_users_and_auth.sql — users table (extending auth.users with profile + role)
3. 0003_businesses.sql — businesses + user_businesses (assignment)
4. 0004_customers.sql — customers + customer_categories
5. 0005_products_and_stock.sql — products + stock_movements
6. 0006_invoices.sql — invoices + invoice_items
7. 0007_returns.sql — returns + return_items
8. 0008_payments.sql — payments
9. 0009_expenses_investments_loans.sql — expenses + investments + loans
10. 0010_ledger.sql — ledger_entries (this is auto-generated from triggers, never inserted directly)
11. 0011_communication.sql — sms_log
12. 0012_audit_log.sql — audit_log + generic trigger function
13. 0013_backups.sql — backups history
14. 0014_app_settings.sql — settings key-value table

For every table:
- UUID primary key
- timestamps (created_at, updated_at) with NOW() defaults
- updated_at trigger to auto-bump on UPDATE
- soft-delete (deleted_at NULL) for: users, customers, products, invoices, payments, expenses, returns
- business_id foreign key on every business-scoped table
- All money columns: BIGINT with _paisa suffix
- Indexes on every foreign key + commonly queried columns

Follow CLAUDE.md conventions strictly. Money is paisa. Snake_case columns. Soft-delete enforced via RLS later.

Output ONE migration file at a time, starting with 0001. After each, wait for me to say "next" before continuing.
```

### Prompt 1.2 — Seed data

```
Create supabase/seed.sql with realistic test data:

- 1 admin user (email: admin@koc.test, password handled via Supabase Auth signup script)
- 1 accountant, 2 staff users, 1 viewer
- 4 businesses: Oil, Cigarettes, Zameen, Other
- 3 customer categories: Local, Distributor, Wholesale
- 50 customers spread across categories and businesses
- 30 products (mix across businesses)
- Stock-in entries totaling ~500k paisa per business
- 100 invoices spanning the last 90 days
- 30 payments
- 20 expenses (mix of business and home)

Use realistic Pakistani names for customers (Muhammad Ali, Fatima Khan, Hassan Trading, etc.) and oil/cigarette/land-related product names.

All money values in paisa. Make sure the math is consistent (invoice items sum to invoice total).

Output the file in chunks if needed — INSERTs first for static data, then a DO block for the parameterized loops.
```

### Prompt 1.3 — Verify

```
Now verify the schema:

1. List every table created with row count from seed.
2. Show the foreign key constraints — confirm cascading deletes on business_id where appropriate.
3. Run a sanity query: total invoice amount in paisa, grouped by business.
4. Check that no invoice has invoice_items summing to a different total than the invoice header.

Report any inconsistencies.
```

**Verification step (do this yourself):**
- [ ] Run `supabase db reset` — migrations apply without error
- [ ] Run `supabase db seed` — seed data loads
- [ ] Open Supabase Studio → Table Editor → confirm row counts match
- [ ] Run a SELECT on `invoices` — `business_id` populated, `total_paisa` is BIGINT, no nulls in required fields

**MEMORY.md update:**
```markdown
- [x] Piece 1 — Database Schema + Seed Data
```

---

## Piece 2: Auth + Row Level Security

```
We are building Piece 2: Auth + Row Level Security.

Reference: CLAUDE.md "Roles & Permissions" section + DECISIONS.md ADR-005, ADR-006.

Tasks:
1. Create RLS policies for every table created in Piece 1. Follow these defaults:
   - Admin: full access on all tables
   - Accountant: read all in their assigned businesses; insert/update on customers, invoices, payments, expenses
   - Staff: read all in their assigned businesses EXCEPT products.purchase_price; insert invoices and payments only
   - Viewer: read-only on customers, products (no purchase_price), invoices

2. Create a Postgres VIEW `products_for_role` that excludes purchase_price for staff/viewer. The API will query this view, not the raw `products` table.

3. Create the SECURITY DEFINER helper function `auth.user_role()` that returns the role of the calling user.

4. Create the audit log generic trigger function `log_audit()` and apply it to: users, businesses, customers, products, invoices, invoice_items, payments, returns, expenses.

5. Create one migration file: 0015_rls_policies.sql

Output the migration in chunks: first the helper function, then policies grouped by table.

After the migration, write a smoke test in /tests/rls.test.sql with:
- A SELECT as staff should NOT return purchase_price
- A SELECT as admin should return purchase_price
- A staff user attempting to UPDATE a price should fail
- A user from Business A should not see customers from Business B
```

**Verification:**
- [ ] Run RLS smoke tests — all pass
- [ ] Manually test in Supabase SQL editor: `SET ROLE` to staff, run a SELECT — purchase_price is null/missing
- [ ] Inspect `audit_log` after a test UPDATE — row appears with before/after JSON

---

## Piece 3: Next.js Scaffold + Shared UI

```
We are building Piece 3: Next.js Scaffold + Shared UI.

Goals:
1. Set up Supabase client helpers in lib/supabase/{client,server,middleware}.ts following the official @supabase/ssr pattern.
2. Create middleware.ts that refreshes session on every request and protects (app) routes.
3. Create app/(auth)/login/page.tsx — email + password form with react-hook-form + zod, calling Supabase signInWithPassword.
4. Create app/(app)/layout.tsx with:
   - Header (left: logo, center: business switcher, right: user menu + bell)
   - Sidebar (collapsible on mobile)
   - Main content area
5. Create lib/auth/permissions.ts with the PERMISSIONS map from CLAUDE.md and a `can(user, permission)` helper.
6. Create lib/auth/guards.ts with `requireAuth()` and `requireRole(role)` server-side helpers that redirect to /login if unauthorized.
7. Set up next-pwa with manifest.json and a basic service worker.
8. Configure tailwind.config.ts with your shadcn theme + a `.no-scrollbar` utility.
9. Create lib/money.ts with: type Money, formatPKR(paisa: Money): string, parsePKR(input: string): Money, paisaToRupees, rupeesToPaisa.
10. Create lib/date.ts with Karachi timezone helpers: nowKarachi(), formatDate(d, format), startOfDayKarachi, endOfDayKarachi.

Implement strictly following CLAUDE.md. Server components by default, "use client" only on the login form and interactive widgets.

Show me the file structure first (just the tree), then ask which file to start with.
```

**Verification:**
- [ ] Login page renders, email + password validation works
- [ ] Login as admin → redirected to dashboard
- [ ] Login as staff → no admin menu items in sidebar
- [ ] Visit /dashboard logged out → redirected to /login
- [ ] PWA installable in Chrome (Lighthouse PWA audit ≥ 90)
- [ ] formatPKR(50000) returns "Rs. 500.00"

---

## Piece 4: Multi-Business Switching

```
We are building Piece 4: Multi-Business Switching.

Tasks:
1. Create components/layout/BusinessSwitcher.tsx — a shadcn dropdown showing businesses the user has access to. Selected business persists in URL (?b=<id>) and a cookie.
2. Create lib/business.ts with `getActiveBusinessId(req)` server helper that reads from cookie/URL and validates user has access.
3. Update all server queries from Piece 5 onward to filter by `getActiveBusinessId()`.
4. Add a global Zustand store (lib/store/business.ts) for client-side business selection.
5. Add a hook `useActiveBusiness()` that returns the current business object.
6. Show business name in the header.
7. Switching business invalidates all TanStack Query caches.

Edge cases:
- User has no businesses assigned → show "Contact admin" message
- User has only one business → no switcher visible, just show name
- URL has invalid business id → fall back to first accessible

Follow CLAUDE.md.
```

**Verification:**
- [ ] Admin sees all 4 businesses in switcher
- [ ] Staff assigned only to Oil sees only Oil
- [ ] Switch from Oil → Cigarettes → URL updates, cookie updates, all data refetches
- [ ] Hard refresh on /customers?b=cigarettes-id → still on Cigarettes

---

## Piece 5: Customers + Products + Stock

```
We are building Piece 5: Customers + Products + Stock.

Implement THREE complete CRUD modules. For each:
- List page with search, filter, pagination (TanStack Table)
- Create / Edit modal with react-hook-form + zod schema
- Detail page (for customer) or inline edit (for product)
- Server actions for create/update/soft-delete

Module A — Customers:
- Fields: name, phone, address, category_id, opening_balance_paisa, notes
- List filters: by category, search by name/phone
- Detail page shows customer header + tabs (Invoices, Payments, Ledger — placeholder for now)

Module B — Products:
- Fields: name, sku (auto-gen), unit (litre/kg/box/etc), sale_price_paisa, purchase_price_paisa, low_stock_threshold
- Staff sees: name, sku, unit, sale_price, current_stock — NO purchase_price (use products_for_role view)
- Admin/accountant sees all fields
- Show current stock computed from stock_movements

Module C — Stock:
- Page showing all products with current stock
- "Add Stock" modal: pick product, qty, rate (admin only), date, supplier note
- Inserts a stock_movements row with type='in'
- Real-time updates via Supabase Realtime subscription

Use:
- Zod schemas in lib/validators/{customer,product,stock}.ts
- Server actions in lib/actions/{customer,product,stock}.ts
- TanStack Query hooks in lib/queries/

Each module is its own commit. Build customers first, ask me to verify, then products, then stock.
```

**Verification:**
- [ ] Create customer → appears in list, filters work
- [ ] Edit customer → updates persist
- [ ] Soft-delete → disappears from list but row exists in DB with deleted_at
- [ ] Add product as admin → purchase price field visible
- [ ] Login as staff → product list has no purchase price column or in network response
- [ ] Add stock → current stock increases for that product
- [ ] Open second browser as different user → stock change appears within 2 seconds

---

## Piece 6: Invoicing + Returns

> ⚠️ **Switch to Claude Opus 4.7 for this piece.** It's the most complex part of the system. The money math has to be perfect.

```
We are building Piece 6: Invoicing + Returns.

This is the most critical piece. The legacy system's invoicing was 3,900 lines of spaghetti — we will do better. Take your time.

Tasks:
1. Create app/(app)/invoices/ with: list, [id]/page.tsx (detail), new/page.tsx (create form).
2. Invoice creation form (this is the main screen):
   - Customer search-and-pick (autocomplete)
   - Show customer's current balance prominently
   - Line items table — each row: product autocomplete, qty, rate (auto-fill sale_price), amount (qty * rate)
   - Add row / remove row
   - Subtotal (sum of items)
   - Discount (amount or %)
   - Net total
   - Payment received now (optional, creates a Payment row)
   - New balance = previous_balance + net_total - payment_received
3. Save invoice via server action that runs in a transaction:
   - Insert invoice row
   - Insert invoice_items rows
   - Insert stock_movements rows (type='out') for each item
   - Insert payment row if amount > 0
   - Insert ledger_entries for invoice (debit) and payment (credit)
   - All-or-nothing — if any fails, roll back
4. Invoice detail page:
   - Header (customer, date, invoice no)
   - Line items table
   - Totals
   - Buttons: Print PDF, Email, Send WhatsApp (Piece 10), Reprint, Edit (24h window only), Delete (soft, admin only)
5. PDF generation using @react-pdf/renderer — match the legacy report layout reasonably.
6. Returns module:
   - List of returnable invoices
   - Return form: pick invoice → check items to return with qty
   - On save: insert return + return_items, reverse stock_movements, adjust customer balance, ledger entries

Validation:
- Cannot create invoice with no items
- Cannot bill quantity exceeding current stock (warn, allow override with admin permission)
- Cannot edit invoice older than 24h (only admin can, must record reason)
- Cannot return more than was sold

Money math: ALL totals computed in paisa, server-side. Client only sends the input fields. Server recomputes totals to prevent tampering.

Write unit tests for the math:
- tests/invoice-math.test.ts — at least 5 cases including: no discount, % discount, fixed discount, edge case of 0 total, large amounts (overflow check)

Implement in this order, with a verification step between each:
1. Database transaction for invoice save (server action only, test with curl/Postman first)
2. Invoice list page
3. Invoice create form (read-only summary first, then add interactivity)
4. Invoice detail page
5. PDF generation
6. Returns

Stop after step 1 and let me verify before continuing.
```

**Verification:** _(at each sub-step)_
- [ ] Create invoice with 5 items → totals match expected → stock decreases for each item → customer balance increases
- [ ] Try to create invoice with negative qty → rejected
- [ ] Try to bill more than stock → warning shown, override requires admin
- [ ] Edit invoice 25 hours later as staff → blocked
- [ ] Process partial return → stock returns correctly, balance adjusts
- [ ] All invoice math unit tests pass

---

## Piece 7: Payments + Ledger

```
We are building Piece 7: Payments + Ledger.

Tasks:
1. Payments module:
   - Standalone payment entry (without invoice) — pick customer, amount, date, method (cash/online/cheque), reference, note
   - Server action: insert payment + ledger entry, reduce customer balance
   - Soft delete (admin only)
2. Customer ledger view (per-customer page):
   - Tab on customer detail page
   - Date range filter
   - Table: date, ref (invoice/payment/return), debit, credit, running balance
   - Generated by querying ledger_entries (already populated by triggers from Piece 6)
   - Print to PDF
3. Replace the legacy Ladger_Table wipe-and-rebuild approach with proper ledger_entries:
   - One row per debit/credit transaction
   - Computed running_balance as a window function in the SELECT (do not store, always recompute)
   - This is critical — the legacy approach was a bug magnet

Verify the ledger always sums to the customer's current balance.
```

**Verification:**
- [ ] Add Rs. 5,000 payment → customer balance reduces by 5,000
- [ ] Open ledger → see invoice (debit), payment (credit), running balance correct at every row
- [ ] Sum of all unsettled customer balances should equal total outstanding receivables (sanity check via SQL)

---

## Piece 8: Expenses + Investments + Loans

```
We are building Piece 8: Expenses + Investments + Loans.

Three small modules:

Expenses:
- List + create form
- Type field: 'business' or 'home' (radio)
- Category dropdown (configurable list in app_settings or hardcoded)
- Amount, date, note, attachment (optional, Supabase Storage)
- Filter by type/category/date

Investments:
- List + create form
- Source (who invested), amount, date, note
- Show running total

Loans:
- List + create form
- Type: 'given' (we lent) or 'received' (we borrowed)
- Party (customer or free text), amount, date, due_date, status (pending/repaid)
- Filter by type/status

Settings page:
- Toggle "Include home expenses in P&L" (bool, stored in app_settings)
- Defaulter days threshold (default 20)

All admin/accountant. Staff can see expenses (for context) but not investments/loans (admin only).
```

**Verification:**
- [ ] Add home expense Rs. 3,000 → with toggle OFF, P&L unchanged. Toggle ON, P&L drops by 3,000
- [ ] Loan marked repaid → status updates, no longer in pending list
- [ ] Investment list shows running total

---

## Piece 9: Reports + P&L

> ⚠️ **Use Opus 4.7** for the P&L computation logic.

```
We are building Piece 9: Reports + P&L.

Build all reports using a consistent pattern:
- app/(app)/reports/<report-name>/page.tsx
- Filter bar at top (date range with presets: Today, This Week, This Month, This Year, Custom)
- Business filter (if user has access to multiple)
- Table or chart below
- Export buttons: PDF, Excel

Reports to build (in this order):
1. Sales Report — invoices in range, grouped by day, with totals
2. Purchase Report — stock_movements type=in with rate (admin/accountant only)
3. Customer Report — per-customer activity (invoices, payments, balance change)
4. Balance Report — outstanding receivables, sortable
5. Profit & Loss — Sales - COGS - Expenses = Profit
   - COGS = sum of (qty * purchase_price_at_time_of_sale) for invoiced items in range
   - Expenses includes home only if app_settings flag is ON
   - Show breakdown: Sales total, COGS, Gross Profit, Expenses (categorized), Net Profit
   - Recharts line chart of profit over time
6. Defaulter List — customers with no activity (invoice or payment) in last N days (configurable, default 20)
   - Red row highlighting
   - Show: name, phone, last activity date, current balance
   - Print button

For P&L: store the purchase_price_at_time_of_sale in invoice_items at sale time. Don't look up current product price for historical reports.

⚠️ Critical: Verify that fixing the COGS approach doesn't require a Piece 6 schema change. If it does, flag it now and propose a migration.
```

**Verification:**
- [ ] Sales report for last week matches manual sum of invoices
- [ ] P&L for "this month" — Net Profit = Sales - COGS - Expenses with home toggle respected
- [ ] Defaulter list shows only customers with last_activity > 20 days ago
- [ ] Excel export downloads correctly with multiple sheets

---

## Piece 10: SMS + WhatsApp Integration

```
We are building Piece 10: SMS + WhatsApp Integration.

Setup:
1. Sign up for Twilio (or chosen Pakistani SMS gateway), Meta WhatsApp Business Cloud API.
2. Add credentials to env vars.
3. Create lib/messaging/{sms.ts, whatsapp.ts} with adapters that share a common interface.
4. Create message templates in code: invoice-summary, payment-receipt, balance-reminder.

Features:
- Invoice detail page: "Send via SMS" / "Send via WhatsApp" buttons
- Customer detail page: "Send balance reminder"
- Bulk: Reports → Defaulter List → "Send reminder to all" (creates a queue, processes 1/sec)
- All sends logged in sms_log with status (queued/sent/delivered/failed)

Edge cases:
- Customer has no phone number → button disabled with tooltip
- Number invalid format → save as failed, show in log
- WhatsApp template approval: use a simple plain-text template for v1 (avoid template approval friction)

Use server actions, not client-side API calls. Never expose Twilio/Meta credentials to the browser.
```

**Verification:**
- [ ] Send invoice via SMS to your own number → arrives within 30 seconds
- [ ] Send via WhatsApp → arrives, log shows delivered status
- [ ] Bulk reminder for 10 defaulters → all sent over 10 seconds (rate limited)

---

## Piece 11: User Management

```
We are building Piece 11: User Management.

Admin-only. /settings/users page:
- List all users with: name, email, role, last_login, status (active/disabled), actions
- Create user button → modal: full_name, email, role, initial_password
- Edit user → modal: full_name, role, business assignments, status
- Reset password → modal: type new password → on submit, show password ONCE on screen with "Copy and share with user" — no second chance to view
- Disable user → toggle active flag; user can no longer log in
- Force logout → revoke all refresh tokens for that user
- View login history → modal showing last 50 logins (date, IP, device)
- View audit log filtered by this user → links to audit log page

Use Supabase service role key (server-side only) for admin operations like creating users, since RLS is bypassed.

Critical: All admin operations server-only. Never expose service role key to the client.
```

**Verification:**
- [ ] Create staff user → log in as them → admin disables → next request fails with 401
- [ ] Reset password → log in with new password works
- [ ] Login history shows the recent logins
- [ ] Audit log filter shows actions for that user only

---

## Piece 12: Backup System

```
We are building Piece 12: Backup System.

Two backup types:

A) Excel backup (admin-triggered + scheduled):
   - Manual: button in /settings/backup → server action generates xlsx using exceljs → returns as download
   - Scheduled: pg_cron job calls a Supabase Edge Function on configured frequency (1/3/5/7/15/30 days)
   - Edge function generates xlsx and:
     - Uploads to Supabase Storage bucket "backups"
     - Sends email to admin via Resend with attachment
     - (Optional) Uploads to Backblaze B2
     - (Optional, future) Sends via WhatsApp to admin
   - Excel structure: one sheet per major table (Customers, Products, Invoices, Invoice_Items, Payments, Expenses, Returns, Stock_Movements, Ledger, SMS_Log, Audit_Log)
   - Money columns formatted as PKR

B) Database SQL dump (daily, automatic):
   - Supabase Edge Function uses pg_dump-equivalent (Supabase doesn't expose pg_dump directly; use a custom export of all tables to JSONL stored in Supabase Storage)
   - Retain last 30 days
   - Gzipped

UI: /settings/backup page:
- Manual "Backup Now" button (Excel)
- Frequency selector (Off / 1 / 3 / 5 / 7 / 15 / 30 days)
- Destination checkboxes (Email, Google Drive, Backblaze, WhatsApp)
- Backup history: last 10 backups with download links

Restore is manual (Phase 4 task) — for now just ensure backups exist and are downloadable.
```

**Verification:**
- [ ] Click "Backup Now" → xlsx downloads with all sheets populated, money formatted correctly
- [ ] Set schedule to 1 day → wait until next day → email arrives with .xlsx
- [ ] Open the xlsx in Excel — every sheet readable, totals match live data
- [ ] Backup history page shows all backups

---

## Piece 13: Data Migration from .mdf

```
We are building Piece 13: Data Migration from .mdf.

Goal: import customers, products, opening balances, and historical invoices from the legacy ProjectData.mdf file into the new system.

Approach:
1. We don't have SQL Server installed, and Supabase is Postgres. So:
   - Step 1 (one-time, on a Windows machine): use SQL Server LocalDB or Express to attach the .mdf, then export each table to CSV.
   - Step 2: Python migration script reads CSVs, transforms data, writes to Supabase via the supabase-py client.

2. Create scripts/migrate.py:
   - Maps each legacy table to new schema (mapping table in DECISIONS.md ADR-XXX)
   - Logs every transformation
   - Validates: total receivables old vs new, customer count old vs new, top 10 balances old vs new
   - Output: validation report as Markdown

3. Run on a fresh Supabase project first (NOT production). Validate. Then run on production once verified.

The mapping:
- Customer_Table -> customers (1:1)
- Product -> products (1:1)
- Stock_Table -> stock_movements (type='in')
- Invoice_Table + Invoice_Table1 -> invoices + invoice_items
- Cash_Table -> payments
- Expense_Table -> expenses (type='business')
- Investment_Table -> investments
- Loan_Table -> loans
- Login -> users (re-hash passwords with bcrypt; force password change on first login)

Rules:
- Skip Ladger_Table (we regenerate from triggers)
- Skip Profit_Table (computed live in P&L)
- Map all dates to UTC assuming legacy was Asia/Karachi
- Money: legacy stored as decimal — multiply by 100, round to nearest paisa, store as BIGINT

Output a dry-run mode that prints the import plan without writing.
```

**Verification:**
- [ ] Dry run shows expected record counts
- [ ] Real run → validation report shows zero discrepancies
- [ ] Total receivables (sum of customer balances) in new = same in old, exactly to the rupee
- [ ] Top 10 customers by balance match exactly

---

## Piece 14: Production Deployment

```
We are building Piece 14: Production Deployment.

Tasks:
1. Buy domain (recommended: Namecheap)
2. Create production Supabase project (separate from dev): koc-prod
3. Apply all migrations to koc-prod
4. Deploy to Vercel:
   - Import GitHub repo
   - Set production env vars
   - Configure custom domain
   - Enable HTTPS (automatic)
5. Set up UptimeRobot monitor on production URL (every 5 minutes) — keeps Supabase from auto-pausing
6. Set up Backblaze B2 bucket
7. Configure Resend domain (verify SPF/DKIM)
8. Twilio production credentials (paid)
9. WhatsApp production verification with Meta
10. Final security checklist:
    - All env vars in Vercel, none in code
    - RLS enabled on every table (run audit query)
    - No service_role key in client bundle
    - Lighthouse audit ≥ 90 on Performance, Accessibility, Best Practices
    - Test 401 paths (logged out, wrong role)
11. Production smoke test:
    - Admin signup
    - Create one customer, one invoice, one payment
    - Send WhatsApp
    - Trigger backup
    - Open on phone, install as PWA
```

**Verification:**
- [ ] https://yourdomain.com loads, SSL valid
- [ ] Login works
- [ ] All Lighthouse scores ≥ 90
- [ ] Backup email arrives the day after deployment
- [ ] PWA installs and works offline for cached pages

---

## Piece 15: Training + Handover

```
We are building Piece 15: Training + Handover.

Deliverables:
1. User manual (PDF) — Roman Urdu + English, screenshots
   - Generate using docs/manual.md → Pandoc → PDF
2. Quick-reference cards per role (one page each)
3. 5–7 minute screen recordings per major feature (use Loom or OBS):
   - Login + business switcher
   - Create invoice
   - Receive payment
   - View ledger
   - Run P&L
   - Send WhatsApp
   - Backup
4. Live training session — 2 hours, recorded
5. 30-day support log: track every bug/question, address within 48h

Don't write code for this piece. Focus on documentation.
```

**Verification:**
- [ ] Owner uses system unassisted for 1 week
- [ ] Staff uses system unassisted for 1 week
- [ ] No critical bugs in 30 days

---

## Generic Debugging Prompt

When something is broken and you can't figure out why:

```
I have a bug. Before fixing, do this:

1. Read the relevant code paths and explain to me step by step what should happen.
2. Read the error/output carefully and identify where reality diverges from expectation.
3. Form 2-3 hypotheses about the cause.
4. For each hypothesis, suggest a minimal experiment to test it (e.g. log a variable, add a breakpoint).
5. Wait for me to run the experiments before proposing a fix.

Bug description: [DESCRIBE]
Error message / wrong behavior: [PASTE]
What I expected: [DESCRIBE]
```

---

## Generic "Add a Field" Prompt

When the schema needs a small change:

```
I need to add field `X` (type: Y) to table `Z`.

Generate:
1. Migration file in supabase/migrations/<timestamp>_add_X_to_Z.sql
2. Update zod schema in lib/validators/<z>.ts
3. Update server action in lib/actions/<z>.ts
4. Update form component to include the field
5. Update table column if shown in lists
6. Run: pnpm supabase gen types typescript > types/database.ts

After step 1, wait for me to apply the migration before continuing with frontend changes.
```

---

## When Claude Code Is Going Off The Rails

Don't be afraid to interrupt. Stock prompts:

- "Stop. You're over-engineering. Make this minimal."
- "Stop. Read CLAUDE.md again, specifically the iron rules. You're violating rule N."
- "Stop. Show me the file tree of changes you're proposing before writing any code."
- "Stop. This conversation has too much context. Summarize the current task in 5 bullets and wait for my confirmation."

---

## Tip: One Piece, One Branch

```bash
# Start a piece
git checkout -b feat/piece-1-schema

# Work on it...

# Done? Squash-merge to main
git checkout main
git merge --squash feat/piece-1-schema
git commit -m "feat: complete piece 1 - database schema"
git push
```

This keeps `main` clean and lets you abandon a half-done piece by deleting the branch.

---

## Piece 16: Product & Invoice Improvements (Sep 2026)

> Four independent changes to the product and invoice flows. **Run them in the
> order below** — Prompt 16.1 settles what a missing sale price means, and
> 16.2's fallback logic depends on that answer.
>
> Each prompt is self-contained and carries the facts already established by
> investigation, so a fresh session does not re-diagnose from a wrong premise.
> **Two of the four original bug reports turned out to rest on false premises**
> — those are corrected inline. Fill in every `[BRACKETED]` decision before
> pasting.

**Status at time of writing:** `purchase_price_paisa` and `sale_price_paisa` are
already `NOT NULL DEFAULT 0` (0 nulls / 55 rows). `invoice_items.unit_price_paisa`
already stores the per-line rate. Migration 0059 already provides the admin
notification pattern. Migration 0060 fixed soft-delete via a SECURITY DEFINER
RPC — `0057_soft_delete_with_check.sql` is redundant and should not be applied.

---

### Prompt 16.1 — Purchase price required, sale price optional

```
# KOC — Make purchase price required and sale price optional

## Facts already verified — do NOT re-investigate these
- products.purchase_price_paisa and products.sale_price_paisa are ALREADY
  `BIGINT NOT NULL DEFAULT 0` (supabase/migrations/0006_products.sql lines
  10-11). ZERO null rows out of 55 total. A NOT NULL migration is NOT needed —
  do not write one.
- Any NULL purchase price seen in the app comes from the products_for_role
  VIEW, which returns NULL for staff/viewer by design (iron rule #3). That is
  role-gating, not missing data. Do not "fix" it.
- lib/validators/product.ts currently has exactly the wrong way round:
    sale_price_paisa:     z.number().int().min(0)               // required
    purchase_price_paisa: z.number().int().min(0).nullable().optional()
- Staff HAVE products.create and products.update (lib/auth/permissions.ts:
  only users.manage, settings.manage, customers.delete and products.delete are
  withheld). Staff CANNOT see purchase price. So making it required would
  block staff from creating products at all.
- lib/actions/product.ts normalise() is the existing place blank values are
  coerced for storage. Put coercion there, not scattered across call sites.

## Decisions — I choose:
Staff handling: [A / B / C]
  A = remove products.create/update from staff; admin + accountant only
  B = required for admin/accountant; staff-created products save with 0 and
      are surfaced to an admin to complete            (RECOMMENDED)
  C = keep optional; only make the label prominent
Sale price of 0 means: [FREE / NOT SET]
  If NOT SET: add a migration making sale_price_paisa nullable and treat null
  as "no sale price" everywhere it is read — products list, invoice product
  picker, reports, PDFs. Audit those read sites BEFORE changing anything.

## Work
1. lib/validators/product.ts — swap required/optional. Reject negatives and
   non-numeric for both. Keep the existing pack refinements intact.
2. components/products/ProductForm.tsx — labels must make the required field
   obvious. The form already appends "per {unit}" / "per {pack}" from the
   pack-pricing work; preserve that wording.
3. lib/actions/product.ts — enforce server-side. Client validation is UX only.
4. Only if NOT SET was chosen: one migration, numbered after 0066.

## Must not
- Expose purchase price to staff/viewer anywhere — including error messages,
  form defaults and validation feedback.
- Introduce float math anywhere near money.
- Touch invoice or stock code.

## Verify — show actual output, not a claim
As ADMIN:
  - Save a product with NO sale price -> succeeds; show the stored row.
  - Blank purchase price -> rejected with a clear message.
  - A negative value and "abc" -> both rejected.
  - Open it in the products list and the invoice product picker; a missing
    sale price must render sensibly (not "Rs. 0.00" if NOT SET was chosen).
As STAFF:
  - Product creation behaves per the chosen option.
  - Inspect the network response: purchase_price_paisa absent or null, never
    a real number.
Then: npx tsc --noEmit, npx eslint, npx vitest run, npx next build.

## Report back
What changed, which migration to run (if any), how to test as each role.
Follow the conventions in CLAUDE.md.
```

---

### Prompt 16.2 — Last sold rate when billing

```
# KOC — Show and pre-fill the last actually-sold rate on invoice lines

## Facts already verified — do NOT re-investigate these
- components/invoices/InvoiceForm.tsx ALREADY has a per-line editable rate
  (`rate_input`, a string, parsed by parseRateInput from lib/invoice.ts). The
  override ALREADY applies to that line only and never writes back to the
  product master — there is a comment saying so at ~line 38. Both properties
  must survive this change.
- The final rate is ALREADY persisted on invoice_items.unit_price_paisa
  (BIGINT NOT NULL, supabase/migrations/0008_invoices.sql). No migration is
  needed to store the rate.
- At ~line 199, selecting a product pre-fills:
      rate_input: formatRateInput(p?.sale_price_paisa ?? 0)
  That is the single line to change.
- resetRate() at ~line 212 does the same thing. Update it consistently so
  "reset" restores the same source the pre-fill used.
- Index idx_invoice_items_product_id already exists, so a batched lookup over
  many products is cheap.
- Migration 0066 added product_name_snapshot / sku / unit to invoice_items
  because a rename or soft delete makes joining products the wrong answer.
  Follow that philosophy: read what was actually sold.
- `canEditRate` comes from app/(app)/invoices/new/page.tsx and resolves to
  currentUserCan('invoices.create'), so staff can edit rates today.

## Decision — I choose: [GLOBAL / PER CUSTOMER]
  GLOBAL       = last rate this product sold at, to anyone
  PER CUSTOMER = last rate sold to THIS invoice's customer, falling back to
                 the global last rate       (RECOMMENDED — otherwise a one-off
                 discount to one buyer silently becomes everyone's default)

## Work
1. ONE batched query returning last sold rate + date for every product on the
   invoice. One round trip for the whole invoice — never one query per line.
   Exclude soft-deleted, draft and cancelled invoices from "last sold".
2. Helper text beside the rate input:
       Last sold: Rs. 13,000.00 on 07 Sep 2026
   Money via formatPKR; dates in Asia/Karachi (iron rule #8).
3. Pre-fill precedence: last sold -> product sale price -> empty.
4. If it ends up empty the rate is REQUIRED before the line can be added.
   Surface it through the existing rateErrors mechanism, not a new one.
5. Re-fetch when the customer changes, if PER CUSTOMER was chosen.

## Must not
- Write the overridden rate back to products.sale_price_paisa.
- Run a query per line item.
- Leak purchase price into anything staff can see.
- Change how totals are computed — computeInvoiceTotals stays the authority
  and the server recomputes on save.

## Verify — show actual output
- Previously sold product: helper text and pre-fill match the most recent
  invoice_item. Query the DB and compare side by side.
- Never-sold product WITH a sale price: falls back to it.
- Never-sold product with NO sale price: empty, and the line cannot be added.
- Override a rate, save, then SELECT the product row and prove
  sale_price_paisa is unchanged.
- Prove batching: for a 5-line invoice show ONE query, not five.
- A soft-deleted product that was previously sold must not crash anything.
- Check at 375px width (iron rule #9).
Then: npx tsc --noEmit, npx eslint, npx vitest run, npx next build.

## Report back
What changed, any migration, how to test as staff and as admin.
Follow the conventions in CLAUDE.md.
```

---

### Prompt 16.3 — Notify admin on sale rate override

```
# KOC — Log rate overrides by staff for admin visibility

## Facts already verified — do NOT build a second notification system
- supabase/migrations/0059_staff_activity_notifications.sql ALREADY built this
  pattern:
    * view public.staff_activity_notifications over activity_log
    * table public.notification_reads — per-admin, per-business high-water
      read marker
  Its own design note says "a notice, not an approval queue". Reuse it.
- That view ALREADY filters `AND u.role <> 'admin'`, so "admin overrides are
  not logged" comes for free. Do not add extra logic for it.
- The view carries an action whitelist:
    'product.created', 'product.updated', 'invoice.created',
    'payment.recorded', 'stock.purchased', 'return.processed'
  Adding an action means adding it to that IN list — a small migration
  numbered after 0066. The view must be dropped and recreated.
- activity_log.metadata is JSONB — put the numbers there.
- logActivity() in lib/actions/activity-log.ts is the existing writer.
- deletion_requests (0054) is the ONLY approval queue in this app and must
  stay that way. This feature blocks and gates nothing.

## Work
1. On invoice save, compare each line's entered rate against the suggested
   rate from 16.2. Beyond the tolerance below, write an activity_log entry
   with action 'invoice.rate_overridden' and metadata containing:
     invoice_id, invoice_number, product_id, product name,
     suggested_rate_paisa, entered_rate_paisa, difference_paisa,
     difference_percent, actor user id, timestamp
   Decide and justify one entry per line vs one per invoice listing lines.
2. Migration: add 'invoice.rate_overridden' to the view's action whitelist.
3. Surface it on the EXISTING notifications screen that reads
   staff_activity_notifications. Money via formatPKR, show the percentage.
   Do not build a new page.
4. Tolerance: log only when the difference is >= 1%. Pack-price division
   produces sub-rupee rounding (Rs. 1,000.08 vs Rs. 1,000.00) that would
   otherwise flood the log. Keep the threshold in ONE named constant.
5. Below-cost flag: separately mark lines where the entered rate is below
   purchase price. COMPUTE SERVER-SIDE ONLY — staff cannot read purchase
   price, so the browser physically cannot make this comparison. Use the
   invoice_items.purchase_price_at_sale_paisa snapshot already taken.

## Must not
- Block or delay saving the invoice.
- Require approval.
- Log admin overrides.
- Return purchase price to a staff client in any payload, including the
  notification feed if a staff user could ever reach it.

## Verify — show actual output
As STAFF:
  - Override by 10%: invoice saves unblocked; one activity_log row with the
    correct difference and percentage.
  - Override by 0.5%: NOTHING logged.
  - Sell below purchase price: loss flag set.
  - Inspect every network response in the invoice flow: no purchase price.
As ADMIN:
  - Override a rate: NOTHING logged.
  - Notifications screen renders staff entries and the unread marker still
    works via notification_reads.
Then: npx tsc --noEmit, npx eslint, npx vitest run, npx next build.

## Report back
What changed, the migration to run, how to test as staff and as admin.
Follow the conventions in CLAUDE.md.
```

---

### Prompt 16.4 — Opening stock on product create

```
# KOC — Add an optional opening stock quantity to Add Product

## The original bug report was based on a WRONG premise
## Do NOT go looking for a broken quantity field.
- There is NO quantity field on the Add Product form. Its fields are: Name,
  Brand, SKU, Unit, Pack Name, Units per Pack, Sale Price, Purchase Price,
  Low Stock Alert, Active. "Low Stock Alert" is the ALERT THRESHOLD
  (low_stock_threshold), not a quantity — most likely what was mistaken
  for one.
- Stock is NOT a column on products. public.current_stock
  (supabase/migrations/0007_stock.sql) is a VIEW that SUMs stock_movements:
  'in' and 'return' add, 'out' subtracts, 'adjustment' adds signed.
- Nothing is silently dropped on insert, and there are NO missing stock rows
  to backfill. A product with no movements is simply absent from the view and
  lib/queries/products.ts maps that absence to quantity_on_hand: 0. Verified
  count of products missing stock rows: 0.
- components/stock/AddStockModal.tsx is the existing way stock is added.
  Match its semantics; do not invent a parallel path.
- stock_movements has NO cost column. Purchase cost lives on stock_purchases
  (unit_price_paisa, purchase_date), linked by stock_movements
  .stock_purchase_id, added in 0040.
- Pack support exists: products.pack_size / pack_name, with lib/units.ts
  converting pack quantities to base units. Stock is ALWAYS stored in base
  units.

This is a NEW FEATURE, not a bug fix. Say so in the commit message.

## Work
1. Optional "Opening stock" field on the Add Product form ONLY. Do NOT add it
   to the edit form — existing stock is a ledger and is corrected with a new
   movement, never by editing a starting number.
2. On successful create, write exactly ONE stock_movements row, type 'in',
   quantity converted to BASE UNITS (honour pack size if entered by pack),
   with a note identifying it as opening stock.
3. Valuation: value it at the purchase price entered on the same form so COGS
   and stock valuation stay correct. Decide and justify whether a
   stock_purchases row is also needed — if not, explain how the purchase
   report will treat it, since that report reads cost from stock_purchases.
4. Blank field = NO movement row at all. Not a zero-quantity row.
5. Reject negative and non-numeric quantities, server-side too.
6. Atomicity: if the product is created but the movement fails, do NOT report
   success. Either use a transaction/RPC, or report the partial outcome
   honestly and say what state the data is in.

## Must not
- Add a quantity column to products.
- Change how current_stock is computed.
- Touch the edit form.

## Verify — show actual output
- Opening stock 10: query stock_movements and show exactly ONE row; /stock
  and the products list both read 10.
- Blank field: ZERO stock_movements rows.
- Packed product (1 Carton = 24), entering 2 Cartons: stored quantity is 48
  base units, not 2.
- -5 and "abc": both rejected, server-side too.
- Stock report values it at the entered purchase price; state what the
  purchase report shows for it.
- As STAFF: the flow works (staff have stock.update).
- Check at 375px width (iron rule #9).
Then: npx tsc --noEmit, npx eslint, npx vitest run, npx next build.

## Report back
What changed, any migration, how to test as staff and as admin.
Follow the conventions in CLAUDE.md.
```
