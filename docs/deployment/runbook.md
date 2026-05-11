# Production Deployment Runbook — Piece 14

> Step-by-step launch-day guide. Follow top-to-bottom; don't skip ahead.
> Estimated total elapsed time: **~6 hours active + 2–5 business days waiting** (Meta WhatsApp verification dominates).

---

## Section 1 — External prerequisites (do these FIRST)

These cannot be automated and have variable wait times. Start them in parallel on Day −7.

| # | Task | Where | Wait time | Cost (approx.) |
|---|---|---|---|---|
| 1.1 | Buy domain (e.g. `khaliqoil.com`) | Namecheap / Cloudflare Registrar | instant | Rs. 3,000–4,500 / yr |
| 1.2 | Create Supabase project named `koc-prod` (region: Singapore) | supabase.com → New project | ~3 min provision | Free tier OK to start |
| 1.3 | Sign up for Resend, add and verify domain | resend.com | 10 min DNS propagation | Free up to 3k/mo |
| 1.4 | Sign up for Twilio, buy a phone number, get prod creds | twilio.com | instant | $1/mo for number + per-SMS |
| 1.5 | Submit Meta business for WhatsApp Business API verification | business.facebook.com | **2–5 business days** ⚠️ | Free, but slow |
| 1.6 | (Optional) Create Backblaze B2 bucket `koc-backups` | backblaze.com | 5 min | Free 10 GB |
| 1.7 | Sign up for UptimeRobot | uptimerobot.com | 2 min | Free |

**If this fails:** any of 1.1–1.5 can block launch. Start them all on Day −7. The runbook below assumes all are done.

---

## Section 2 — Apply database migrations to `koc-prod`

**Estimated time:** 10 min.

```bash
# 2.1 — Authenticate the Supabase CLI (one-time)
export SUPABASE_ACCESS_TOKEN=<your-personal-access-token>
# Get it from: supabase.com → Account → Access Tokens

# 2.2 — Link this repo to the prod project
supabase link --project-ref <koc-prod-ref>
# Find the ref in the project URL: https://supabase.com/dashboard/project/<ref>

# 2.3 — Push every migration in supabase/migrations/
supabase db push

# 2.4 — Verify in Studio
# Open https://supabase.com/dashboard/project/<ref>/database/tables
# Confirm: users, businesses, customers, products, invoices, payments,
#          expenses, investments, loans, ledger_entries, audit_log, backups
#          (and all other tables from migrations 0001–0036) are present.
```

**If this fails:**
- `supabase db push` errors on missing extension → migration 0001 enables `pgcrypto`; re-run.
- "Permission denied for schema auth" → `0017_rls_policies.sql` references `auth.user_role()`. Confirmed-known issue: function lives in `public.user_role()` instead. The migrations already account for this; if you see it, you're on a stale checkout — `git pull` and retry.
- DO NOT push `0016_seed.sql` against prod. It contains test users with a known password. Migrations 0017+ assume those users exist — for prod, replace with the steps in Section 3 BEFORE pushing 0017.

**Pre-push gotcha:** `0016_seed.sql` is a dev-only file. For prod, either (a) skip it and create users via Section 3 + manually insert one business, or (b) before `supabase db push`, temporarily rename `0016_seed.sql` to `0016_seed.sql.skip` so the CLI ignores it (then push 0017+ which will run with no seed data).

---

## Section 3 — Create the initial admin user

**Estimated time:** 5 min.

This user will be the bootstrap admin. They will then create all other users via the in-app `/settings/users` page (Piece 11).

1. Supabase Studio → **Authentication → Users** → **Add user → Create new user**.
2. Email: the owner's real email (e.g. `owner@khaliqoil.com`).
3. Password: 16-char random; share securely with the owner. They MUST rotate via `/profile` on first login.
4. Check **Auto Confirm User**.
5. Click **Create user**.
6. Studio → **SQL Editor** → run:
   ```sql
   UPDATE public.users
   SET role = 'admin', full_name = 'Khaliq Khan'
   WHERE email = 'owner@khaliqoil.com';

   INSERT INTO public.businesses (name, type) VALUES ('Khaliq Oil Company', 'oil');

   INSERT INTO public.user_businesses (user_id, business_id)
   SELECT
     (SELECT id FROM public.users WHERE email = 'owner@khaliqoil.com'),
     (SELECT id FROM public.businesses WHERE name = 'Khaliq Oil Company');
   ```

**If this fails:** the auth-user-created trigger from `0003_users.sql` populates `public.users` automatically. If the row is missing, the trigger didn't fire — re-run `0003` or insert manually.

---

## Section 4 — Resend domain verification

**Estimated time:** 15 min active + 30 min DNS propagation.

1. Resend dashboard → **Domains** → **Add Domain** → enter `khaliqoil.com`.
2. Resend shows **3 DNS records** to add (1× SPF TXT, 1× DKIM TXT, 1× MX or return-path). Copy the exact values.
3. At the registrar (Namecheap → Domain → **Advanced DNS**), add each record. See [dns-cheat-sheet.md](./dns-cheat-sheet.md) for the full table.
4. Back in Resend → click **Verify**. May take 5–30 min for DNS to propagate.
5. Once green, create an API key: **API Keys → Create API Key** with **Full Access** (or Sending-only). Save value as `RESEND_API_KEY`.

**If this fails:** Use `dig TXT _dmarc.khaliqoil.com` to confirm propagation. Cloudflare proxying breaks Resend — make sure these specific records are **DNS only** (grey cloud), not proxied.

---

## Section 5 — Twilio setup

**Estimated time:** 20 min.

1. Twilio Console → **Phone Numbers → Buy a Number** → choose a number with SMS capability (international support if sending to PK).
2. **Note:** if buying a US/UK number to send to PK, Twilio requires a Toll-Free Verification or A2P 10DLC registration to deliver reliably. This adds 1–3 days.
3. Console → **Account Info** → copy **Account SID** and **Auth Token**.
4. Save:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER` (E.164, e.g. `+19725551234`)

**If this fails:** SMS to Pakistan numbers may silently fail without A2P registration. Test with one real PK mobile before launch.

---

## Section 6 — WhatsApp Business setup

**Estimated time:** 30 min active + 2–5 business days for Meta verification (started in Section 1).

1. business.facebook.com → **Business Settings → Accounts → WhatsApp Accounts → Add**.
2. Once verified (Section 1.5), open **WhatsApp Manager → API Setup**.
3. Copy **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. Generate a **System User** (Business Settings → Users → System Users → Add):
   - Role: Admin
   - Generate token with `whatsapp_business_messaging` + `whatsapp_business_management` scopes
   - Set token expiry to **Never**
   - Copy → `WHATSAPP_ACCESS_TOKEN`.
5. Add a message template (Business Manager → WhatsApp → Message Templates) for invoice notifications. Approval takes ~1 hour.

**If this fails:** Meta verification rejection is common — they'll email a reason. Most rejections are due to missing business documents (utility bill, registration certificate). Re-submit with cleaner docs.

---

## Section 7 — Vercel link, env vars, and first deploy

**Estimated time:** 15 min.

```bash
# 7.1 — Authenticate
vercel login

# 7.2 — Link this repo to a Vercel project (creates one on first run)
vercel link
# Pick: scope (your team), project name "koc", framework auto-detected (Next.js)

# 7.3 — Push every env var (see vercel-env-vars.md for the full list)
# Easiest: add via dashboard (Settings → Environment Variables → Add).
# CLI alternative for each:
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add RESEND_API_KEY production
vercel env add NEXT_PUBLIC_APP_URL production       # set to https://app.khaliqoil.com
vercel env add NEXT_PUBLIC_APP_NAME production      # "Khaliq Oil Company"
# Add Twilio/WhatsApp/Backblaze vars only after their integrations are wired (Pieces 10 + Backblaze).

# 7.4 — Trigger production deploy
vercel --prod

# 7.5 — Note the deploy URL printed at the end (e.g. koc-abc123.vercel.app).
# This is the temporary URL until the custom domain attaches.
```

**If this fails:**
- Build fails on missing env var → most common: `SUPABASE_SERVICE_ROLE_KEY` missing. The build itself succeeds without it (it's lazy-loaded per request), but server actions throw. Check `lib/supabase/admin.ts:15-17`.
- Build fails on TS error → run `pnpm tsc --noEmit` locally first to catch.
- Build succeeds but pages 500 → 90% of the time it's a wrong Supabase URL or typo'd anon key. Inspect Function logs in Vercel dashboard.

---

## Section 8 — Custom domain attach + DNS

**Estimated time:** 15 min active + up to 24h for SSL (usually 5 min).

1. Vercel project → **Settings → Domains → Add Domain**.
2. Enter `app.khaliqoil.com` (subdomain) or `khaliqoil.com` (apex) + `www.khaliqoil.com`.
3. Vercel shows DNS records to add. See [dns-cheat-sheet.md](./dns-cheat-sheet.md) for the table.
4. At the registrar, add the records.
5. Back in Vercel → click **Refresh**. SSL certificate provisions automatically once DNS resolves (Let's Encrypt; 5 min typical, up to 24h max).
6. Once green checkmark appears, visit the URL — should serve the login page over HTTPS.

**If this fails:**
- "Invalid Configuration" → your registrar's nameservers haven't propagated. Use `dig app.khaliqoil.com` and check the answer matches Vercel's expected target.
- SSL stuck for >2h → Vercel Support is the only path. Most often caused by a stale CAA record at the registrar.

---

## Section 9 — UptimeRobot keep-alive monitor

**Estimated time:** 5 min.

Supabase free-tier projects pause after 7 days of inactivity. UptimeRobot pinging the app every 5 minutes prevents this.

1. UptimeRobot → **Add New Monitor**.
2. Type: **HTTP(s)**.
3. Friendly name: `KOC Production`.
4. URL: `https://app.khaliqoil.com/login` (a public route — no auth required).
5. Monitoring interval: **5 minutes**.
6. Alert contacts: add the owner's email.
7. Save.

**If this fails:** confirm `/login` returns 200 publicly (not redirected to a 401). If it redirects to auth, use `/api/health` instead — but you'd need to add such an endpoint first.

---

## Section 10 — (Optional) Backblaze B2 backup destination

**Estimated time:** 15 min. Skip if not using B2.

1. Backblaze → **B2 Cloud Storage → Buckets → Create Bucket** named `koc-backups`. Privacy: **Private**.
2. **Application Keys → Add a New Application Key**:
   - Name: `koc-prod-backup-writer`
   - Allow access to: `koc-backups` only
   - Type: Read and Write
3. Copy `keyID` → `B2_KEY_ID`. Copy `applicationKey` (shown ONCE) → `B2_APPLICATION_KEY`.
4. Add all three to Vercel env vars (Section 7.3) AND Supabase secrets (for the Edge Function):
   ```bash
   supabase secrets set B2_KEY_ID=… B2_APPLICATION_KEY=… B2_BUCKET_NAME=koc-backups
   ```

**If this fails:** the Backblaze destination is currently labeled "Coming soon" in the backup UI — wiring it requires changes to `supabase/functions/scheduled-backup/index.ts`. This is on the roadmap but not yet built.

---

## Section 11 — Run the security checklist

**Estimated time:** 2 min.

```bash
./docs/deployment/security-checklist.sh
```

Expected: all checks PASS, exit 0. Any FAIL must be resolved before announcing the URL to users. WARNs are fine but should be reviewed.

**If this fails:** the script prints a per-check explanation. Address each FAIL by either fixing the issue (rotate a leaked key, add a missing RLS policy) or — only if you're certain it's a false positive — documenting the exception in this runbook.

---

## Section 12 — Production smoke test

**Estimated time:** 20 min. Do this on a real phone over cellular (not office WiFi) to mimic the owner's experience.

| # | Action | Expected result |
|---|---|---|
| 12.1 | Open `https://app.khaliqoil.com/login` on iPhone Safari | Login page loads, padlock icon visible |
| 12.2 | Sign in as the bootstrap admin (Section 3) | Dashboard loads, business switcher shows "Khaliq Oil Company" |
| 12.3 | `/customers/new` → create "Smoke Test Customer", phone `+923001234567` | Redirects to customer detail page |
| 12.4 | `/invoices/new` → pick that customer, add a product, save | Invoice detail page loads, totals render correctly |
| 12.5 | Click **Print PDF** on the invoice | PDF downloads, opens cleanly |
| 12.6 | `/payments/new` → pre-fill from customer link, full payment | Payment row appears in customer ledger; balance returns to 0 |
| 12.7 | (If Piece 10 deployed) Click **WhatsApp** on the invoice | Owner's phone receives message |
| 12.8 | `/settings/backup` → **Backup Now** | XLSX downloads in browser AND row appears in History list |
| 12.9 | (If email destination set) Verify backup email arrives at owner inbox | Email present with `.xlsx` attachment |
| 12.10 | iPhone Safari → Share menu → **Add to Home Screen** | App icon appears, opens fullscreen as PWA |
| 12.11 | Inside PWA, sign out → log back in | Session persists across sign-out/sign-in |
| 12.12 | (Cleanup) Delete the smoke-test customer + invoice + payment | Soft-delete preserves audit trail; rows hidden from list |

**If any step fails:** do NOT announce launch to users. File the issue and revert if needed (`vercel rollback` reverts to the previous deploy).

---

## Section 13 — Post-launch monitoring (first 7 days)

| What | Where | Cadence |
|---|---|---|
| UptimeRobot alerts | Email | As triggered |
| Vercel Function logs | Vercel dashboard → Logs | Daily review for 500s |
| Supabase usage | Supabase Studio → Reports | Weekly check vs free-tier limits |
| Backup history | `/settings/backup` → History | Confirm a successful backup ran each scheduled day |
| Audit log | `/reports/audit` (admin only) | Spot-check for unexpected admin actions |

---

## Rollback procedure

If a deploy breaks production:

```bash
# List recent deploys
vercel ls --prod

# Promote the previous good deploy
vercel rollback <deployment-url>
```

Rollback is **instant** and does not affect the database. For database issues, restore from the most recent Supabase point-in-time backup (free tier: 7 days; Pro: 30 days).
