# PROJECT STATUS — Khaliq Oil Company (KOC)

> Snapshot of what is **done** and what **remains**, generated from a full read of the codebase, migrations, and `MEMORY.md`.
> **Last reviewed:** 2026-07-24 · **Source of truth for live progress:** [MEMORY.md](./MEMORY.md)

---

## 1. At a Glance

| | |
|---|---|
| **Overall** | ~90% built. Full application feature-complete for core operations; blocked only on external provisioning + two integration pieces. |
| **Phase 1 — Foundation & Database** | ✅ **Complete** |
| **Phase 2 — Core Modules** | ✅ **Complete** |
| **Phase 3 — Reports & Communication** | ✅ **Complete** (except Piece 10 SMS/WhatsApp — deferred on credentials) |
| **Phase 4 — Launch** | 🔨 **In progress** — migrator + deploy prep built; execution blocked on 5 external prereqs |
| **Runs locally** | ✅ Verified — `pnpm dev`, `/` → 307 → `/login` (200) |
| **Build** | ✅ 36 routes, 0 TS errors, 48/48 unit tests passing (per last session) |

---

## 2. What's DONE ✅

### Foundation (Phase 1)
- **Database schema** — 36 migrations applied to Supabase cloud (`0001`–`0036`). 20 tables, all money as `BIGINT` paisa, soft-delete columns, audit triggers.
- **Row Level Security** — RLS on all 20 tables, ~80 policies, `public.user_has_business()` + `public.user_role()` helpers. Purchase price hidden from staff/viewer via `products_for_role` VIEW at the DB level.
- **Auth** — Supabase Auth (email + password), SSR server client, browser client, service-role admin client with browser-import guard. Login page, session helper, `proxy.ts` (Next 16 middleware).
- **Scaffold + shared UI** — App Router layout (Header, Sidebar, UserMenu, AppShell), permission-filtered sidebar, `lib/money.ts` (+19 tests), `lib/date.ts` (Karachi tz), PWA manifest + icons.

### Core Modules (Phase 2)
- **Multi-business switching** — cookie-based active business, Zustand store, `BusinessSwitcher`, access guards.
- **Customers** — CRUD, table (search/sort), detail page with Details/Ledger tabs, role-gated create/update actions.
- **Products + Stock** — CRUD, realtime stock movements (immutable, adjustment via new rows), role-gated purchase price, `current_stock` view.
- **Invoicing + Returns** — atomic invoice RPC (`create_invoice_atomic`) with purchase-price snapshot, dynamic line items, discounts, PDF, mark-paid, soft-delete-with-reason; returns RPC (`create_return_atomic`) with stock/ledger reversal. 17 unit tests on invoice math.
- **Payments + Ledger** — payment creation → ledger trigger, customer ledger RPC with running balance window function, printable customer statement PDF. Invariant SQL-verified (diff = 0).
- **Expenses + Investments + Loans + Settings** — business/home expense split with receipt uploads (private Storage bucket), investments (admin), loans given/taken with repayment tracking, settings (business name/address/phone, P&L home-expense toggle, defaulter days).

### Reports & Communication (Phase 3)
- **9 reports** — Sales, Purchase, Customer, Receivables (aging buckets), **P&L** (SQL-verified math, COGS from captured-at-sale price), Defaulters, Stock, Daily Cash Book, Audit Log. All with date-range filters + PDF/Excel export server actions. Recharts visualizations.
- **User Management (admin)** — 9 server actions (create/update/reset-password/soft-delete/restore/list/login-history/change-own-password/update-profile), last-admin invariants (12 tests), login history via `auth.sessions` RPC, profile page.
- **Backup System** — in-app Excel backup (14 sheets), Backup Now + schedule UI + history, private `backups` Storage bucket, two Deno Edge Functions (`scheduled-backup`, `daily-db-dump`). Live-verified building a 1218-row workbook.

### Launch prep (Phase 4)
- **Data migration** — `scripts/migrate.ts` (~750 LOC) mapping legacy `.mdf`/CSV → new schema, dry-run default + `--confirm`. Dry-run on sample CSVs reconciled receivables **exactly** (Rs. 68,445.50, diff = 0.00).
- **Deployment prep** — 4-doc package under `docs/deployment/`: env-var inventory, 13-section runbook, `security-checklist.sh` (8 PASS / 0 FAIL / 2 WARN), DNS cheat sheet.
- **Security hardening** — role gates added to customer + product actions (defense in depth over RLS) — commit `e0bdb3b`.

### Uncommitted local work (in the working tree now)
- **`lib/validators/uuid.ts`** (new) — `uuidLike()` validator that accepts the 8-4-4-4-12 hex shape without Zod v4's strict RFC version/variant bits, so synthetic seed + legacy-migration IDs validate. Rolled across `customer/invoice/loan/payment/return/stock/user` validators.
- `app/page.tsx` removed (root redirect now handled by `app/(app)/page.tsx`); minor `CustomerTable`, `PaymentForm`, `lib/date.ts` tweaks. **Not yet committed.**

---

## 3. What's REMAINING 🔲

### Blocked on external provisioning (not code)
1. **Domain** — not purchased (`khaliqoil.com`? — open question).
2. **`koc-prod` Supabase project** — production project not created (dev = `drqpqjsamguffwkxiilp`).
3. **Resend** — account + API key not provisioned (blocks email backups + transactional email).
4. **Twilio** — production credentials not provisioned (blocks SMS).
5. **Meta WhatsApp Business** — verification not started (2–5 business day wait; blocks WhatsApp).

### Pieces not yet complete
- **Piece 10 — SMS + WhatsApp integration** ⏸️ Deferred. UI placeholders exist (invoice/defaulter reminder buttons); wiring waits on prereqs 3 & 5. `sms_log` table + communication schema already in place.
- **Piece 12 — Backup deployment** — code done; `supabase functions deploy` + pg_cron schedule SQL **not yet executed** (documented in SETUP.md).
- **Piece 13 — Migration confirmed run** — migrator built + dry-run validated; awaits a **real `.mdf` export** and a confirmed run against an empty prod project.
- **Piece 14 — Production Deployment** — 🔲 Not started (blocked on all 5 prereqs). Runbook ready.
- **Piece 15 — Training + Handover** — 🔲 Not started.

### Known tech debt (from MEMORY.md)
- **Customer balance query** (`lib/queries/customers-balance.ts`) sums ledger client-side — replace with a server-side `customer_balances_view` before production scale.
- **Seed / debug migrations** — `0016_seed.sql` (dev test users, known password) must **not** run on prod; rename to `.skip` per runbook. Several `002x_debug/fix` migrations exist from resolving broken seed-user auth.
- `public.user_role()` lives in `public` (not `auth`) due to cloud permission limits — all RLS references it there.
- Vercel project + GitHub remote not yet created (first commit done; not pushed).

---

## 4. How to Run Locally

```bash
pnpm install
pnpm dev          # http://localhost:3000  (redirects to /login)
pnpm test         # vitest — 48 unit tests
pnpm build        # production build (36 routes)
pnpm migrate      # legacy data migrator (dry-run by default; --confirm to write)
```

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (already present in this checkout). See [SETUP.md](./SETUP.md) for full setup.

Test login: `owner@khaliqoil.com` (dev admin created in Session 6). Legacy seed users use password `KocTest2024!` — dev only.

---

## 5. Next Actions (in order)

1. Commit the pending `uuidLike` validator refactor.
2. Provision the 5 external prereqs (domain, prod Supabase, Resend, Twilio, WhatsApp).
3. Deploy Edge Functions + pg_cron for backups (Piece 12 finish).
4. Execute Piece 14 runbook (prod migrations → admin bootstrap → Vercel → domain → smoke test).
5. Wire Piece 10 (SMS/WhatsApp) once creds exist.
6. Confirmed migration run against empty prod project with real `.mdf`.
7. Piece 15 — training + handover.

---

_For the full session-by-session history and per-piece notes, see [MEMORY.md](./MEMORY.md). For architectural decisions, see [DECISIONS.md](./DECISIONS.md)._
