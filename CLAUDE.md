# CLAUDE.md

> This file is read by Claude Code at the start of every session. It is the **single source of truth** for how to work on this project. Follow it strictly. If anything here conflicts with a user request, ask before deviating.

---

## Project Identity

**Name:** Khaliq Oil Company (KOC)
**Type:** Multi-business web application (PWA-installable) for a Pakistani trading business
**Owner:** Single owner managing multiple businesses (Oil, Cigarettes, Zameen, etc.)
**Users:** ~5–10 internal users (admin, accountant, staff, viewer)
**Replaces:** Legacy C# WinForms desktop app + SQL Server LocalDB

---

## Tech Stack (Locked — Do Not Change Without Approval)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)** | Full-stack React, server components, mature |
| Language | **TypeScript (strict mode)** | Type safety, especially around money |
| Styling | **Tailwind CSS + shadcn/ui** | Utility-first, accessible components |
| Database | **Supabase (Postgres)** | Free tier, RLS, realtime, auth in one |
| Auth | **Supabase Auth** (email + password) | bcrypt under the hood |
| Hosting | **Vercel** (Next.js) + **Supabase cloud** | Free tier sufficient |
| State | **Zustand** for client state, **TanStack Query** for server state | Lightweight, proven |
| Forms | **react-hook-form + zod** | Validation matters (financial data) |
| Tables | **TanStack Table** | Sort, filter, paginate |
| Charts | **Recharts** | For P&L and reports |
| PDF | **@react-pdf/renderer** (client) and **Puppeteer** (server, for backups) | |
| Excel export | **exceljs** | Multi-sheet backups |
| SMS | **Twilio** (or local PK gateway later) | |
| WhatsApp | **WhatsApp Business Cloud API** (Meta) | |
| Email | **Resend** | Transactional |
| Real-time | **Supabase Realtime** | Built-in |
| Date/time | **date-fns** + **date-fns-tz** | Asia/Karachi timezone |
| Money | **Custom Money type with integer paisa** (see Money Handling below) | Never use floats for currency |
| PWA | **next-pwa** | Installable on phones |

**Node version:** 20.x LTS
**Package manager:** pnpm

---

## Iron Rules (Never Break These)

### 1. Money is NEVER stored as a float
- Store all currency amounts as **integers in paisa** (1 PKR = 100 paisa).
- Use a `Money` TypeScript type. Display only in formatters.
- This is non-negotiable. Floating-point math will break the books.

```typescript
// ✅ Correct
const amount: Money = 50000; // Rs. 500.00 stored as 50000 paisa

// ❌ Wrong
const amount = 500.50; // floats lose precision
```

### 2. Multi-tenancy via `business_id`
- Every business-scoped table has a `business_id` column.
- Every query MUST filter by the active `business_id`.
- RLS policies enforce this at the database level.
- Never trust the client to filter — always enforce on the server.

### 3. Purchase prices are role-gated at the database level
- The `products.purchase_price` column is hidden from `staff` and `viewer` roles via a database VIEW.
- The API never returns purchase_price for those roles. Not even hidden in UI — actually absent from the response.
- If you find yourself adding `if (role !== 'staff') return purchasePrice` on the client, you're doing it wrong.

### 4. Soft-delete, never hard-delete (financial records)
- Invoices, payments, expenses, returns: never `DELETE`. Add a `deleted_at` column.
- Customers, products, users: also soft-delete (preserves audit trail).
- Hard delete only for: `audit_log` rows older than 2 years (cron job), draft data.

### 5. Audit log everything that changes money or auth
- Every INSERT/UPDATE/DELETE on `invoices`, `payments`, `expenses`, `users`, `products` triggers an audit log row.
- Use a Postgres trigger, not application code (so it can't be skipped).
- Audit log table is admin-only-readable.

### 6. No raw SQL string concatenation
- Always use Supabase client query builders or parameterized queries.
- The legacy app had SQL injection in 36 forms. We do not repeat this.

### 7. Always validate on the server
- Client-side validation is for UX only. Re-validate every API call on the server with zod.
- Permissions: never check role only on the client. Always enforce in API route + RLS.

### 8. Timezone: store UTC, display Asia/Karachi
- Database: `TIMESTAMPTZ`, always UTC.
- Display: format with `date-fns-tz` to `Asia/Karachi` (UTC+5).
- User input: assume Karachi time, convert to UTC before saving.

### 9. Mobile-first, always
- Every screen designed for 375px (iPhone SE) first, then scaled up.
- Tap targets: min 44x44px.
- Forms: avoid tiny inputs, prefer larger steppers and pickers on mobile.
- Test in Chrome DevTools mobile mode before considering a screen done.

### 10. No `any` in TypeScript
- Use `unknown` if you don't know the type, then narrow.
- ESLint rule `@typescript-eslint/no-explicit-any` is set to error.

---

## Architecture

```
app/
  (auth)/            Public routes (login, forgot password)
  (app)/             Protected routes, requires auth
    layout.tsx       Header + Sidebar + business switcher
    dashboard/
    customers/
    products/
    invoices/
    payments/
    expenses/
    investments/
    loans/
    ledger/
    reports/
    settings/        Admin only
  api/               Route handlers (server actions preferred)

components/
  ui/                shadcn/ui primitives (Button, Input, etc.)
  layout/            Header, Sidebar, BusinessSwitcher
  forms/             Reusable form fields (CurrencyInput, DatePicker, etc.)
  data/              DataTable, EmptyState, etc.
  modals/            Add/Edit modals

lib/
  supabase/
    client.ts        Browser client
    server.ts        Server-side client (with auth context)
    admin.ts         Service role client (server only, dangerous)
  auth/
    permissions.ts   Role -> permission map
    guards.ts        requireRole(), requirePermission()
  money.ts           Money type + format/parse helpers
  date.ts            Karachi timezone helpers
  validators/        Zod schemas (one file per domain)
  queries/           TanStack Query hooks
  actions/           Server actions

types/
  database.ts        Generated from Supabase
  domain.ts          Business types

supabase/
  migrations/        SQL migrations (numbered)
  seed.sql           Test data
  functions/         Edge Functions

tests/
  e2e/               Playwright
  unit/              Vitest
```

---

## Database Conventions

- Table names: **plural snake_case** (`customers`, `invoice_items`)
- Column names: **snake_case** (`created_at`, `business_id`)
- Primary keys: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Foreign keys: `<table>_id` (e.g. `customer_id`)
- Timestamps: every table has `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Soft delete: `deleted_at TIMESTAMPTZ` (nullable)
- Money columns: `BIGINT` (paisa), suffix `_paisa` (e.g. `total_paisa`, `discount_paisa`)
- Booleans: prefix `is_` (e.g. `is_active`)
- Indexes: name as `idx_<table>_<columns>`

## RLS Policy Conventions

Every table needs four policies (or explicit "no access"):
- `<table>_select` — who can read
- `<table>_insert` — who can create
- `<table>_update` — who can edit
- `<table>_delete` — who can delete (often: nobody, soft delete instead)

Use a helper function in SQL to check roles:
```sql
CREATE OR REPLACE FUNCTION auth.user_role() RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;
```

---

## Roles & Permissions (Fixed, No Overrides)

```typescript
type Role = 'admin' | 'accountant' | 'staff' | 'viewer';

const PERMISSIONS = {
  admin: ['*'],
  accountant: [
    'customers.*', 'products.view', 'invoices.*',
    'payments.*', 'expenses.*', 'reports.view',
    'reports.pnl', 'ledger.view',
  ],
  staff: [
    'customers.view', 'customers.create',
    'products.view',  // sale price only, NOT purchase
    'stock.view', 'stock.update',
    'invoices.create', 'invoices.view',
    'payments.create',
  ],
  viewer: [
    'customers.view', 'products.view',
    'invoices.view', 'reports.view_basic',
  ],
};
```

The legacy system stored passwords in plaintext. **We never do.** All passwords go through Supabase Auth (bcrypt). Admin can RESET passwords but never VIEW existing ones. This is non-negotiable.

---

## Code Style

- **No comments unless explaining "why," never "what"**
- Functions: prefer pure, small, named
- React: server components by default, `"use client"` only when needed
- Imports: absolute via `@/` alias (configured in tsconfig)
- Naming: PascalCase for components, camelCase for functions, UPPER_SNAKE for constants
- File naming: kebab-case for routes, PascalCase for components (`CustomerForm.tsx`)
- One component per file (mostly)
- Co-locate: keep tests next to code (`Customer.tsx` + `Customer.test.tsx`)

---

## Forbidden Patterns

- ❌ `useEffect` for data fetching (use TanStack Query or RSC)
- ❌ `any` (use `unknown` or define a type)
- ❌ Floating point money (`number` for prices) — use Money/paisa
- ❌ Inline SQL strings — use Supabase client
- ❌ Storing JWTs in localStorage (use Supabase auth helpers + httpOnly cookies)
- ❌ `router.push` after mutation without invalidating queries
- ❌ Nested ternaries deeper than one level
- ❌ Default exports (named exports only, except for Next.js page/layout files)

---

## When You're Stuck

1. **Check MEMORY.md** — current phase, recent decisions
2. **Check DECISIONS.md** — has this been decided before?
3. **Check the existing code** — is there a similar pattern already?
4. **Ask the user** — better to ask than to guess wrong on financial logic

If a task feels too big, break it down. Aim for changes that touch < 5 files at a time.

---

## Definition of Done (per piece)

A piece is done when:
- [ ] Code compiles with no TS errors
- [ ] No ESLint warnings
- [ ] Manual test passes in browser (mobile + desktop view)
- [ ] If it's a server route: tested with curl or Postman
- [ ] If it changes the schema: migration is reversible
- [ ] If it touches money: at least one unit test
- [ ] MEMORY.md updated with what was completed
- [ ] Committed to Git with a clear message

---

## Git Commit Convention

```
<type>(<scope>): <subject>

[optional body]
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `db`
Scopes: `auth`, `customers`, `products`, `invoices`, `reports`, `ui`, `infra`

Examples:
- `feat(invoices): add line item discount support`
- `db(stock): add index on product_id, created_at`
- `fix(auth): handle expired refresh token correctly`

---

## Reference Files

- `MEMORY.md` — current state, what's done, what's next
- `DECISIONS.md` — every architectural decision logged
- `ARCHITECTURE.md` — deeper dive into data flow
- `PROMPTS.md` — proven prompts for common tasks
- `SETUP.md` — first-time environment setup
