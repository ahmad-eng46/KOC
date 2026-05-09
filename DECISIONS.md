# DECISIONS.md

> Every important architectural decision is logged here with the **why**. This prevents future-you (or Claude in a new session) from re-litigating settled questions. Format adapted from ADR (Architecture Decision Records).

---

## ADR-001: Use Supabase instead of self-hosted Postgres + NestJS
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Need a backend with auth, database, realtime, storage. Considered: (a) NestJS + self-hosted Postgres on VPS, (b) Supabase managed, (c) Firebase.

**Decision:** Supabase free tier.

**Rationale:**
- Free tier is generous (500 MB DB, 1 GB storage, unlimited API calls)
- Postgres is real Postgres — no vendor lock-in like Firebase
- Auth, RLS, realtime, storage, edge functions all built-in
- Faster to ship as a solo dev with Codex/Claude Code
- Can self-host later if needed (it's just Postgres)

**Trade-offs accepted:**
- 7-day inactivity pause (mitigated by UptimeRobot)
- No daily auto-backup on free tier (mitigated by custom backup system in Piece 12)
- Less infra control than self-hosted

---

## ADR-002: Money as integer paisa, never float
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Currency math with floats is broken (`0.1 + 0.2 = 0.30000000000000004`). For a business app, this is unacceptable.

**Decision:** Store all money as `BIGINT` representing **paisa** (1 PKR = 100 paisa). Format on display only.

**Implementation:**
- Column suffix: `_paisa` (e.g. `total_paisa`)
- TypeScript type: `type Money = number` (with branded helper)
- Helper: `formatMoney(50000) → "Rs. 500.00"`
- Helper: `parseMoney("500.50") → 50050`

**Trade-offs accepted:**
- Slightly more verbose than using floats
- Need to remember conversion at boundaries

---

## ADR-003: PWA web app, no native mobile
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Owner wants the app on phones. Options: (a) React Native, (b) PWA, (c) responsive web only.

**Decision:** Mobile-first responsive Next.js web app + PWA.

**Rationale:**
- Owner explicitly said "I can use web on mobile, no need for app store"
- Single codebase = much faster to build and maintain
- PWA installs to home screen, looks like a native app
- No Play Store or App Store review process
- No iOS dev account ($99/year saved)

**Trade-offs accepted:**
- No push notifications on iOS Safari (limited PWA support)
- No barcode scanner native API (workaround: web camera)
- Can add React Native v2 later if needed

---

## ADR-004: Email + password auth, no SSO, no PIN
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Internal app for ~5–10 users. SSO would be overkill.

**Decision:** Supabase Auth with email + password. No PIN, no magic link, no SSO.

**Rationale:**
- Small user count
- Admin manages all accounts (creates, resets passwords)
- bcrypt under the hood — passwords never stored in plaintext
- Simpler UX, fewer moving parts

---

## ADR-005: Admin-only user creation; admin cannot view existing passwords
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Owner initially wanted to view staff passwords. Pushed back firmly.

**Decision:**
- Only admin can create/edit/reset/disable/delete user accounts
- Admin types initial password when creating user
- Admin can reset to any new password anytime — system shows new password ONCE on screen
- Admin **cannot** view existing passwords (technically impossible — bcrypt is one-way)
- Staff cannot change their own password — only admin can
- Admin sees full audit log of every user action

**Rationale:** Storing readable passwords creates legal liability (PECA), reputational risk if leaked, and protects staff from cross-site password reuse exposure. Reset-and-tell flow gives admin 100% practical control with 0% of the security risk.

**Owner agreement:** Confirmed in conversation 2026-05-07.

---

## ADR-006: Multi-business via single tenant model with `business_id` column
**Date:** 2026-05-07
**Status:** Accepted

**Context:** Owner manages Oil, Cigarettes, Zameen, Others. Each needs separated sales/purchases/expenses/P&L.

**Decision:** Single Supabase project, single `tenants` row (the owner), multiple `businesses` rows. Every business-scoped table has a `business_id` foreign key. Active business stored in URL/cookie; UI provides a header switcher.

**Rejected alternatives:**
- Separate Supabase projects per business — too complex, can't compare across businesses
- Schema-per-business — Postgres pain, hard to migrate
- Subdomain-per-business — overkill for one owner

**Trade-offs accepted:**
- All business data lives in one DB (acceptable, owner trusts admin role)
- Cross-business reports trivial (good)

---

## ADR-007: Soft delete for financial records
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** Tables `invoices`, `invoice_items`, `payments`, `expenses`, `returns`, `customers`, `products`, `users` all have `deleted_at TIMESTAMPTZ NULL`. Hard delete is forbidden via RLS.

**Rationale:** Financial records must be recoverable. A staff accidentally deleting an invoice should not lose the data. Audit trail integrity.

**Hard delete allowed for:**
- `audit_log` rows older than 2 years (cron)
- Drafts that were never saved (different table)

---

## ADR-008: Audit log via Postgres triggers, not application code
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** A trigger on every audited table writes to `audit_log` automatically.

**Rationale:** Application-code audit logging can be skipped (forgotten in a new endpoint, bypassed by direct SQL). Triggers fire no matter what writes to the table.

**Implementation:**
- Generic trigger function `log_audit()` reads `OLD` and `NEW` rows
- Trigger applied per table
- Captures: `user_id` (from `auth.uid()`), `action`, `table_name`, `row_id`, `before_jsonb`, `after_jsonb`, `at`

---

## ADR-009: Realtime updates via Supabase channels
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** Use Supabase Realtime for live updates on: stock changes, new invoices, new payments, defaulter list. Subscribe per user, scoped to their accessible businesses.

**Rationale:** Built-in, free, no Socket.io setup needed. Counter-staff see admin's rate update instantly.

---

## ADR-010: Strict TypeScript, zero `any`
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** `tsconfig.json` with `"strict": true`. ESLint: `@typescript-eslint/no-explicit-any: error`. Generated DB types from Supabase.

**Rationale:** Money math + permissions + multi-business filtering are all places where a type bug = real money lost. Worth the friction.

---

## ADR-011: pnpm as package manager
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** pnpm over npm or yarn.

**Rationale:** Faster installs, strict dependency resolution (catches phantom dependencies), disk space efficient.

---

## ADR-012: date-fns + date-fns-tz, no Moment
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** date-fns for date math, date-fns-tz for Karachi timezone handling.

**Rationale:** Moment.js is in maintenance mode and huge. date-fns is tree-shakeable, immutable, modern.

**Karachi timezone gotcha:** Pakistan does not observe DST. UTC+5 always. But still use `Asia/Karachi` (not hardcoded `+05:00`) in case rules ever change.

---

## ADR-013: shadcn/ui over Material UI / Mantine / Chakra
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** shadcn/ui (copy-paste components, you own the code).

**Rationale:**
- Components live in your repo (full customization)
- Built on Radix UI (accessibility built-in)
- Tailwind-native
- No runtime overhead
- Easy to theme

---

## ADR-014: Server actions over REST API routes (Next.js)
**Date:** 2026-05-07
**Status:** Accepted

**Decision:** Use Next.js server actions for mutations. API routes only for: webhooks, file uploads, third-party integrations.

**Rationale:** Better DX, type-safe end-to-end, automatic CSRF protection.

---

## Decisions Pending

These need owner input before locking. Move to numbered ADR once decided.

| # | Question | Default if unanswered |
|---|---|---|
| P1 | SMS gateway: Twilio vs Pakistani provider? | Twilio for v1 (faster) |
| P2 | Domain name? | `khaliqoil.com` if available |
| P3 | Default backup frequency? | 7 days |
| P4 | Default for "include home expenses in P&L"? | OFF |
| P5 | Logo / branding? | Use a temporary text logo |

---

## How to Add a New Decision

1. Bump the ADR number.
2. Use this template:

```markdown
## ADR-XXX: <one-line title>
**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-YYY

**Context:** Why is this decision needed?

**Decision:** What did we decide?

**Rationale:** Why this option over alternatives?

**Trade-offs accepted:** What are we giving up?
```

3. Update MEMORY.md "Active Decisions" table if it changes day-to-day behavior.
