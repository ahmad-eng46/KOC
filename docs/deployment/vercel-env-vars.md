# Vercel Environment Variables

> Single source of truth for environment variables required to deploy KOC to production.
> Verified against the codebase on **2026-05-11** (grep of `process.env.*` and `Deno.env.get(*)` references).

## How to set in Vercel

Project → **Settings → Environment Variables** → add each row below to the **Production** environment (and **Preview** for any non-production-only secret you also want preview deploys to use).

After adding or rotating any var, redeploy the project (Vercel only injects env vars at build time for `NEXT_PUBLIC_*` vars; server-side vars are picked up on the next deploy).

---

## Web app (Next.js / Vercel)

These are the vars the running Vercel app reads via `process.env.*`.

| # | Name | Required | Example value | Where to get it | What breaks if missing |
|---|---|:---:|---|---|---|
| 1 | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://abcdefghijklm.supabase.co` | Supabase Studio → Project Settings → **API** → "Project URL" | Every page fails — server, client, and middleware all instantiate Supabase from this. The build will succeed but every request 500s on first DB call. |
| 2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `eyJhbGciOiJIUzI1NiIs…` (JWT, ~200 chars) | Supabase Studio → Project Settings → **API** → "Project API keys" → `anon` `public` | Auth login + all RLS-scoped reads break. Login page itself errors. |
| 3 | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | `eyJhbGciOiJIUzI1NiIs…` (JWT, ~200 chars) | Supabase Studio → Project Settings → **API** → "Project API keys" → `service_role` `secret` | User-management actions, admin password reset, and the migrator script all throw at startup (see `lib/supabase/admin.ts:15-17`). **Never expose this — it bypasses RLS.** |
| 4 | `RESEND_API_KEY` | ⚠️ optional today, required for email backups | `re_AbCdEf123…` (starts with `re_`) | Resend dashboard → **API Keys** → Create | Backup panel hides the "Email" destination option (`lib/backup/schedule.ts:47`). No crash; UI degrades gracefully to "Coming soon". |
| 5 | `NEXT_PUBLIC_APP_URL` | ⚠️ recommended | `https://app.khaliqoil.com` | Your custom domain (after step 4 of the runbook) | Currently unused in code, but reserved for outbound email links / OG tags. Add it now to avoid a redeploy later. |
| 6 | `NEXT_PUBLIC_APP_NAME` | ⚠️ recommended | `Khaliq Oil Company` | You pick — used in PWA manifest + email subjects | Currently unused; reserved. |

### Forward-looking — set these only when the corresponding Piece is wired

The codebase doesn't reference these yet (Piece 10 deferred, Backblaze marked "Coming soon" in Piece 12). Add them only after the integration is built — adding empty strings now is fine but does nothing.

| # | Name | For | Example value | Where to get it | Notes |
|---|---|---|---|---|---|
| 7 | `TWILIO_ACCOUNT_SID` | Piece 10 SMS | `AC` + 32 hex chars | Twilio Console → **Account Info** | Required pair with token. |
| 8 | `TWILIO_AUTH_TOKEN` | Piece 10 SMS | 32 hex chars | Twilio Console → **Account Info** → Show Auth Token | Rotate immediately if leaked. |
| 9 | `TWILIO_FROM_NUMBER` | Piece 10 SMS | `+1234567890` (E.164) | Twilio Console → **Phone Numbers** → Active Numbers | Must be SMS-capable + verified for Pakistan if sending PK. |
| 10 | `WHATSAPP_PHONE_NUMBER_ID` | Piece 10 WhatsApp | 15-digit numeric ID | Meta for Developers → **WhatsApp** → API Setup → "Phone number ID" | Different from the actual phone number. |
| 11 | `WHATSAPP_ACCESS_TOKEN` | Piece 10 WhatsApp | `EAA…` long-lived token | Meta for Developers → **WhatsApp** → API Setup → System User token | Use a System User token — temporary tokens expire in 24h. |
| 12 | `B2_KEY_ID` | Piece 12 Backblaze backup | 25-char alphanumeric | Backblaze B2 → **Application Keys** → Create with read-write on `koc-backups` | Pair with B2_APPLICATION_KEY. |
| 13 | `B2_APPLICATION_KEY` | Piece 12 Backblaze backup | 31-char base64-ish | Same dashboard, shown **once** at creation | Re-create the key if lost — cannot retrieve. |
| 14 | `B2_BUCKET_NAME` | Piece 12 Backblaze backup | `koc-backups` | Backblaze B2 → **Buckets** | Bucket should be private (no public listing). |

---

## Edge Functions (Supabase, NOT Vercel)

These are set with `supabase secrets set --env-file <file>` and live on the Supabase project, not Vercel. Listed here for completeness.

| Name | Required | Example | Where set | Used by |
|---|:---:|---|---|---|
| `SUPABASE_URL` | auto | (auto-injected) | Supabase runtime provides this | `scheduled-backup`, `daily-db-dump` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | same as Vercel #3 | `supabase secrets set` | Both Edge Functions |
| `RESEND_API_KEY` | optional | same as Vercel #4 | `supabase secrets set` | `scheduled-backup` only (no-op if missing) |
| `RESEND_FROM` | optional | `KOC Backup <backup@khaliqoil.com>` | `supabase secrets set` | `scheduled-backup` (defaults to `khaliqoil.com` sender) |

Set them with:

```bash
supabase secrets set \
  SUPABASE_SERVICE_ROLE_KEY=eyJ… \
  RESEND_API_KEY=re_… \
  RESEND_FROM='KOC Backup <backup@khaliqoil.com>'
```

---

## Local development (`.env.local`)

For reference. Vercel ignores `.env.local` — these only matter for `pnpm dev` and `pnpm migrate`.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<dev-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…
SUPABASE_SERVICE_ROLE_KEY=eyJ…
# Optional locally:
# RESEND_API_KEY=re_…
```

`.env.local` **must not be committed** — verified by [security-checklist.sh](./security-checklist.sh).

---

## Verifying after deploy

```bash
# From the project root with vercel CLI logged in:
vercel env ls production
```

Expected: vars #1, #2, #3 present (others optional). Compare against this table; redact secrets when sharing.

---

## Rotation policy

- **Service role key:** rotate immediately if any laptop with `.env.local` is lost or any committed-by-mistake key is detected. Rotation: Supabase Studio → Settings → API → **Roll**. Update both Vercel and `.env.local`.
- **Resend / Twilio / WhatsApp / Backblaze:** rotate annually or on personnel change.
- **Anon key:** safe to expose (it's public); rotation is rarely needed.
