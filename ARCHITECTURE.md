# ARCHITECTURE.md

> Deeper technical reference for the project. Diagrams, data flow, and the "why" behind structural choices.
> Update when architecture changes (rare).

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        END USER                             │
│   Phone browser  /  Tablet browser  /  Desktop browser      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Vercel (Edge + Functions)                 │
│   Next.js 14 App Router                                     │
│   ├─ Server Components (default)                            │
│   ├─ Server Actions (mutations)                             │
│   ├─ Route Handlers (webhooks, file uploads)                │
│   └─ Middleware (auth refresh, route protection)            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├─────────► Supabase Postgres (data)
                       │           ├─ RLS policies enforce auth
                       │           ├─ Triggers write audit_log
                       │           └─ Realtime channels broadcast
                       │
                       ├─────────► Supabase Auth (sessions)
                       │
                       ├─────────► Supabase Storage (files)
                       │           ├─ backup files
                       │           ├─ invoice PDFs (cache)
                       │           └─ optional logos / images
                       │
                       ├─────────► Supabase Edge Functions
                       │           ├─ Scheduled backups (pg_cron)
                       │           ├─ SMS webhooks (Twilio)
                       │           └─ WhatsApp webhooks (Meta)
                       │
                       ├─────────► Twilio API (SMS)
                       ├─────────► Meta WhatsApp Cloud API
                       ├─────────► Resend (email)
                       └─────────► Backblaze B2 (off-site backup)
```

---

## Data Flow: Creating an Invoice (the complex case)

```
1. USER fills invoice form in browser
   ├─ Customer autocomplete (search via TanStack Query)
   ├─ Add line items (product autocomplete)
   ├─ Each row: qty, rate, amount (computed client-side for display)
   └─ Subtotal, discount, total (computed client-side for display)

2. USER clicks Save
   ├─ Form data → zod validation (client)
   └─ Submit → Server Action

3. SERVER ACTION (createInvoice)
   ├─ Re-validate with zod (don't trust client)
   ├─ Recompute all totals server-side (paisa math)
   ├─ Begin Postgres transaction
   │   ├─ INSERT invoice (header)
   │   ├─ INSERT invoice_items (rows)
   │   ├─ INSERT stock_movements (one per item, type='out')
   │   ├─ Check stock not negative (else rollback)
   │   ├─ INSERT payment if amount > 0
   │   ├─ Triggers fire:
   │   │   ├─ ledger_entries inserted (debit for invoice, credit for payment)
   │   │   ├─ audit_log inserted (one row per change)
   │   │   └─ updated_at bumped
   │   └─ COMMIT
   ├─ Realtime broadcast: 'invoice_created' on business channel
   └─ Return { ok: true, invoiceId }

4. CLIENT
   ├─ Invalidate TanStack Query caches (invoices, customer balance, stock)
   ├─ Show toast "Invoice saved"
   └─ Redirect to /invoices/[id]

5. OTHER CONNECTED USERS
   └─ Realtime subscription fires → their dashboards refetch
```

This pattern (validate, transaction, triggers fire, broadcast, invalidate) repeats for every mutation.

---

## Schema Quick Reference

```
auth.users (Supabase managed)
       │
       │ 1:1
       ▼
public.users
  ├─ role: admin | accountant | staff | viewer
  ├─ full_name, email, phone
  ├─ is_active, last_login_at
  └─ created_at, updated_at, deleted_at

       │
       │ M:M via user_businesses
       ▼
businesses
  ├─ name (Oil, Cigarettes, Zameen, ...)
  ├─ type
  └─ is_active

       │
       │ 1:M (every business-scoped table FK to business_id)
       ▼
customers, products, invoices, invoice_items, payments,
stock_movements, expenses, investments, loans, ledger_entries,
returns, return_items, sms_log, audit_log, backups, app_settings
```

### Critical foreign keys

```
invoice_items.invoice_id → invoices.id      [CASCADE delete]
invoice_items.product_id → products.id      [RESTRICT delete]
stock_movements.product_id → products.id    [RESTRICT]
stock_movements.invoice_id → invoices.id    [SET NULL]   (for sales)
ledger_entries.customer_id → customers.id   [RESTRICT]
ledger_entries.ref_type, ref_id              (polymorphic — invoice/payment/return)
audit_log.user_id → users.id                [SET NULL]    (preserve log if user deleted)
```

---

## Money Type — How It Works

We never use `number` for currency. We use `Money`, an integer count of paisa.

```typescript
// types/money.ts
export type Money = number; // intentionally just a number, treated as paisa

// lib/money.ts
export function paisaToRupees(p: Money): number {
  return p / 100;
}

export function rupeesToPaisa(r: number): Money {
  // Always round to avoid float errors
  return Math.round(r * 100);
}

export function formatPKR(p: Money, opts?: { showSymbol?: boolean }): string {
  const rupees = (p / 100).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return opts?.showSymbol === false ? rupees : `Rs. ${rupees}`;
}

export function parsePKR(input: string): Money {
  const cleaned = input.replace(/[^\d.]/g, '');
  return rupeesToPaisa(parseFloat(cleaned) || 0);
}

// Math (always returns Money)
export function sum(items: Money[]): Money {
  return items.reduce((a, b) => a + b, 0);
}

export function applyDiscount(amount: Money, discount: Money): Money {
  return Math.max(0, amount - discount);
}

export function applyDiscountPercent(amount: Money, percent: number): Money {
  return Math.round(amount * (1 - percent / 100));
}
```

**At input boundaries (form fields, API):** `parsePKR(input)` → Money.
**At output boundaries (UI display):** `formatPKR(money)` → string.
**In between:** always paisa, always integer.

---

## Time Handling

Pakistan is UTC+5, no DST. But we don't hardcode `+05:00`.

```typescript
// lib/date.ts
import { format, formatInTimeZone, toZonedTime } from 'date-fns-tz';

const KARACHI = 'Asia/Karachi';

export function nowKarachi(): Date {
  return toZonedTime(new Date(), KARACHI);
}

export function formatKarachi(d: Date | string, fmt = 'dd MMM yyyy'): string {
  return formatInTimeZone(typeof d === 'string' ? new Date(d) : d, KARACHI, fmt);
}

export function startOfDayKarachi(d: Date): Date {
  // ... use date-fns-tz utilities
}
```

**Database:** always `TIMESTAMPTZ`, always stored as UTC.
**UI:** always rendered in Karachi time.
**User input (date pickers):** convert from Karachi-perceived time → UTC → save.

---

## Realtime Strategy

We use Supabase Realtime for live updates. Each user subscribes to channels scoped to their accessible businesses.

```typescript
// lib/realtime.ts
const channel = supabase
  .channel(`business:${activeBusinessId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'invoices', filter: `business_id=eq.${activeBusinessId}` },
      (payload) => {
        // Invalidate relevant TanStack Query caches
        queryClient.invalidateQueries(['invoices']);
      })
  .subscribe();
```

**What gets realtime updates:**
- Invoices list (new invoice → appears)
- Stock changes (counter staff sees admin's update instantly)
- Payments (customer balance changes)
- Defaulter list

**What doesn't:**
- Reports (snapshot at request time, manual refresh)
- Settings (rarely changes)
- Audit log (admin only, manual refresh fine)

---

## RLS Policy Pattern

Every business-scoped table follows this pattern:

```sql
-- SELECT: user must have access to the business
CREATE POLICY "<table>_select" ON <table>
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM user_businesses WHERE user_id = auth.uid()
    )
  );

-- INSERT: user must have access AND have permission
CREATE POLICY "<table>_insert" ON <table>
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM user_businesses WHERE user_id = auth.uid()
    )
    AND auth.user_role() IN ('admin', 'accountant', 'staff')
  );

-- UPDATE: similar; UPDATE often restricted to admin/accountant
-- DELETE: usually denied (use soft delete via UPDATE deleted_at)
```

For sensitive columns like `purchase_price`, we use a VIEW instead of column-level security:

```sql
CREATE VIEW products_for_role AS
SELECT
  id, business_id, name, sku, unit, sale_price_paisa,
  CASE
    WHEN auth.user_role() IN ('admin', 'accountant') THEN purchase_price_paisa
    ELSE NULL
  END AS purchase_price_paisa,
  low_stock_threshold, created_at, updated_at, deleted_at
FROM products;
```

Application code queries `products_for_role`, not `products` directly (except for admin operations).

---

## Audit Log Trigger Pattern

Generic trigger applied to multiple tables:

```sql
CREATE OR REPLACE FUNCTION log_audit() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    user_id, table_name, row_id, action, before_jsonb, after_jsonb, at
  ) VALUES (
    auth.uid(),
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END,
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to each audited table:
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_audit();
```

This guarantees no write escapes the audit log, no matter where it comes from.

---

## Permission Enforcement Layers

We enforce role permissions at THREE layers, defense-in-depth:

1. **UI** — Hide buttons/menus the user can't use (via `can()` helper).
2. **Server Action** — `requireRole()` guard at the start of every mutation.
3. **Database (RLS)** — Final line of defense. Even if UI and server have bugs, database refuses.

The middle layer is the most important. Never skip it.

---

## File Naming Cheatsheet

```
app/(app)/customers/page.tsx           # list page
app/(app)/customers/[id]/page.tsx      # detail page
app/(app)/customers/new/page.tsx       # create page
components/customers/CustomerForm.tsx  # PascalCase component
lib/validators/customer.ts             # zod schema, singular noun
lib/actions/customer.ts                # server actions, singular noun
lib/queries/customers.ts               # TanStack hooks, plural noun (collection)
types/customer.ts                      # types, singular noun
supabase/migrations/0004_customers.sql # plural, prefixed with order
```

---

## Performance Notes

For ~5–10 internal users on a single shop, performance is rarely a concern. But:

- **N+1 queries:** Use Supabase `select('*, customer:customers(name)')` joins instead of fetching in a loop.
- **Pagination:** Always paginate lists. Don't fetch all 10,000 customers at once.
- **Reports:** Compute server-side. Don't ship raw data to client.
- **Indexes:** Add for any column you filter on. Especially `business_id` + `created_at`.

---

## What This Architecture Optimizes For

1. **Correctness over cleverness** — Money math, audit trail, role enforcement.
2. **Solo dev velocity** — Server actions, TanStack Query, shadcn/ui = less plumbing.
3. **Cheap operation** — Free tier of everything until you outgrow it.
4. **Future flexibility** — Postgres lets us self-host or migrate later. PWA can become React Native if needed.

---

## What This Architecture Does NOT Optimize For

- High concurrency (1000s of simultaneous users) — not needed for an internal shop app
- Offline-first — added complexity, not needed v1
- Complex permission overrides — fixed roles are sufficient
- Multi-region failover — single region is fine for one country
