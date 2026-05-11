# SETUP.md — Zero to Running

> Follow this in order. Each step has a verification — don't skip them.
> Estimated time: **3–4 hours** for first-time setup.

---

## Day 1 — Accounts & Tools (1 hour)

### Step 1: Install local tools

```bash
# 1. Node.js 20 LTS (use nvm if possible)
# Mac
brew install node@20

# Windows: download installer from https://nodejs.org

# 2. pnpm (package manager)
npm install -g pnpm

# 3. Git (probably already installed)
git --version

# 4. Supabase CLI
npm install -g supabase

# 5. VS Code extensions
# - Supabase (official)
# - ESLint
# - Prettier
# - Tailwind CSS IntelliSense
# - GitLens
```

**Verify:**
```bash
node --version    # v20.x
pnpm --version    # 9.x or later
git --version
supabase --version
```

### Step 2: Create accounts (all free tier)

| Service | URL | Why |
|---|---|---|
| GitHub | https://github.com | Code hosting |
| Supabase | https://supabase.com | Backend |
| Vercel | https://vercel.com | Frontend hosting |
| Resend | https://resend.com | Email |

**Use the SAME email** for all (your business email — e.g. `ahmad@khaliqoil.com` once you have a domain).

### Step 3: Configure Git

```bash
git config --global user.name "Ahmad"
git config --global user.email "your@email.com"
```

---

## Day 1 — Project Initialization (1 hour)

### Step 4: Create the Next.js project

```bash
# Pick a folder you'll keep this in
cd ~/Projects   # or wherever you keep code

# Create the app
pnpm create next-app@latest koc-app
```

Answer the prompts:
```
✔ Would you like to use TypeScript? Yes
✔ Would you like to use ESLint? Yes
✔ Would you like to use Tailwind CSS? Yes
✔ Would you like to use `src/` directory? No
✔ Would you like to use App Router? Yes
✔ Would you like to use Turbopack for next dev? Yes
✔ Would you like to customize the default import alias (@/*)? No
```

```bash
cd koc-app
```

### Step 5: Move the starter docs into the project

Copy these files into the project root (you got them from me):
- `CLAUDE.md`
- `MEMORY.md`
- `DECISIONS.md`
- `ARCHITECTURE.md`
- `PROMPTS.md`
- `SETUP.md` (this file)

### Step 6: Install core dependencies

```bash
# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# Forms + validation
pnpm add react-hook-form @hookform/resolvers zod

# Data fetching
pnpm add @tanstack/react-query
pnpm add -D @tanstack/react-query-devtools

# State
pnpm add zustand

# UI primitives (shadcn/ui setup)
pnpm dlx shadcn@latest init
# Pick: Default style, Slate color, CSS variables: yes

# Common shadcn components (install later as needed too)
pnpm dlx shadcn@latest add button input label card dialog dropdown-menu table form select toast

# Tables
pnpm add @tanstack/react-table

# Charts
pnpm add recharts

# Dates
pnpm add date-fns date-fns-tz

# PDF
pnpm add @react-pdf/renderer

# Excel
pnpm add exceljs

# Icons
pnpm add lucide-react

# PWA
pnpm add next-pwa
pnpm add -D @types/next-pwa
```

### Step 7: Initialize Git and push to GitHub

```bash
git init
git add -A
git commit -m "chore: initial Next.js scaffold + project docs"

# On GitHub, create a new private repo named "koc-app"
# Then:
git remote add origin https://github.com/<your-username>/koc-app.git
git branch -M main
git push -u origin main
```

**Verify:** Visit your GitHub repo URL — files should be there.

---

## Day 1 — Supabase Project (45 min)

### Step 8: Create Supabase project

1. Go to https://supabase.com/dashboard
2. Click **New project**
3. Name: `koc-dev` (we'll create `koc-prod` later)
4. Database password: **strong password — save it in a password manager**
5. Region: **Singapore** (closest to Pakistan with low latency)
6. Pricing plan: **Free**
7. Wait ~2 minutes for provisioning

### Step 9: Get your Supabase credentials

In your Supabase project dashboard:
- **Settings → API** → copy the `URL` and `anon public` key
- **Settings → API** → copy the `service_role` key (treat like a password — server-only)

### Step 10: Wire up env vars

Create `.env.local` in your project root:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Add these later as you reach those pieces
# RESEND_API_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
```

Verify `.gitignore` includes `.env.local` (it should by default).

### Step 11: Link local Supabase CLI to your project

```bash
supabase login
supabase init
supabase link --project-ref <your-project-ref>
# Project ref is in your Supabase URL: https://<project-ref>.supabase.co
```

**Verify:**
```bash
supabase status
```

---

## Day 1 — First Run & Sanity Check (30 min)

### Step 12: Run the dev server

```bash
pnpm dev
```

Open http://localhost:3000 — you should see the Next.js welcome page.

### Step 13: Replace the welcome page with a "Hello KOC" placeholder

Edit `app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Khaliq Oil Company</h1>
        <p className="text-muted-foreground mt-2">
          Multi-business management system
        </p>
      </div>
    </main>
  );
}
```

Save. Browser auto-refreshes. Verify it shows the new content.

### Step 14: Commit progress

```bash
git add -A
git commit -m "chore: install core dependencies and placeholder home page"
git push
```

---

## Day 1 — Connect Claude Code (15 min)

### Step 15: Open the project in VS Code with Claude Code

```bash
code .
```

In VS Code:
1. Open the Claude Code panel
2. **Claude Code automatically reads `CLAUDE.md` from the project root** — this is why we created it
3. Verify by asking Claude Code:

```
"What are the iron rules for this project?"
```

It should answer with the rules from CLAUDE.md (money as paisa, no `any`, etc.)

If it doesn't see the file, check that `CLAUDE.md` is in the project root (same folder as `package.json`).

### Step 16: Set Claude Code's model

Per Anthropic recommendation for this project:
- **Default**: Claude Sonnet 4.6 (fast, accurate, cheap)
- **Switch to Opus 4.7** for: schema design review, security review, complex bug hunts, the invoicing logic in Piece 6

Configure in Claude Code settings.

### Step 17: Confirm Claude Code understands the project

Ask Claude Code:
```
"Read MEMORY.md and tell me what piece we're starting next."
```

Expected answer: "Piece 1 — Database Schema + Seed Data."

If it answers correctly, you're ready.

---

## Day 1 Done — Verification Checklist

- [ ] Local tools installed (node, pnpm, supabase CLI)
- [ ] All accounts created (GitHub, Supabase, Vercel, Resend)
- [ ] Next.js project created with TypeScript + Tailwind + App Router
- [ ] Starter docs (CLAUDE.md, MEMORY.md, etc.) in project root
- [ ] All core dependencies installed
- [ ] Git initialized, repo pushed to GitHub
- [ ] Supabase project created, credentials saved in `.env.local`
- [ ] Supabase CLI linked to project
- [ ] Dev server runs at localhost:3000
- [ ] Placeholder home page shows
- [ ] Claude Code reads CLAUDE.md and answers correctly

If all 11 boxes are checked, you're ready for **Piece 1: Database Schema**.

Open `PROMPTS.md` → Piece 1 → copy the prompt → paste into Claude Code.

---

## Day 2+ — Building Pieces

From this point on, each session looks like this:

1. Open the project: `code .`, `pnpm dev`, open Claude Code
2. Tell Claude Code: "Read MEMORY.md and tell me where we are"
3. Open `PROMPTS.md`, find the next piece's prompt
4. Paste prompt into Claude Code, work through it
5. Test the result yourself in browser
6. Commit when working: `git add -A && git commit -m "feat(<scope>): <what>"`
7. Update MEMORY.md with what got done
8. Push: `git push`

**Don't move to the next piece until the current one passes its verification step in PROMPTS.md.**

---

## Costs So Far (Day 1)

| Service | Cost |
|---|---|
| Everything used today | Rs. 0 |

Domain costs come at deployment time (Phase 4). Until then, you build for free.

---

## Backup System (Piece 12) — Edge Functions + pg_cron

The in-app "Backup Now" button works without any of this setup. The
sections below configure **scheduled** backups and the **daily DB dump**.

### Required env (Edge Function secrets)

```bash
supabase secrets set \
  RESEND_API_KEY=re_xxxxx \
  RESEND_FROM='KOC Backup <backup@yourdomain.com>'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected for
Edge Functions; you do NOT need to set them.

### Deploy the Edge Functions

```bash
# from the repo root
supabase functions deploy scheduled-backup --no-verify-jwt
supabase functions deploy daily-db-dump --no-verify-jwt
```

`--no-verify-jwt` is required because pg_cron calls them via service-role
auth, not user JWT.

### Enable pg_cron + pg_net (Supabase dashboard)

Database → Extensions → enable both `pg_cron` and `pg_net`.

### Schedule the cron jobs (run as service role in SQL editor)

The scheduled-backup function checks each business's
`backup_schedule.frequency_days` and runs only when due. It's safe to
poll hourly:

```sql
SELECT cron.schedule(
  'koc-scheduled-backup',
  '0 * * * *',                 -- every hour at :00
  $$
  SELECT net.http_post(
    url := 'https://drqpqjsamguffwkxiilp.supabase.co/functions/v1/scheduled-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  );
  $$
);
```

Daily DB dump at **03:00 Asia/Karachi** = **22:00 UTC**:

```sql
SELECT cron.schedule(
  'koc-daily-db-dump',
  '0 22 * * *',                -- 22:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://drqpqjsamguffwkxiilp.supabase.co/functions/v1/daily-db-dump',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    )
  );
  $$
);
```

> **Note on the service-role key in pg_cron:** the recommended pattern is
> to store it in Supabase Vault under the name `service_role_key`. If
> you'd rather paste it inline, you can hardcode the bearer string — but
> rotate it carefully because any DB superuser can read pg_cron job SQL.

### Verify

```sql
-- Active cron jobs
SELECT jobid, jobname, schedule, command FROM cron.job;

-- Recent runs (last 10)
SELECT jobname, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 10;
```

### Disable / remove

```sql
SELECT cron.unschedule('koc-scheduled-backup');
SELECT cron.unschedule('koc-daily-db-dump');
```

### pg_cron expressions cheat sheet

| Frequency      | Expression       |
|----------------|------------------|
| every hour     | `0 * * * *`      |
| every 3 hours  | `0 */3 * * *`    |
| daily 03:00 PKT | `0 22 * * *`    |
| weekly Sunday  | `0 22 * * 0`     |
