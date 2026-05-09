# Khaliq Oil Company

> Multi-business management web application — a modern replacement for the legacy Windows desktop billing system.

## What This Is

A web application that runs on any browser (phone, tablet, desktop) to manage:

- Customers, products, stock
- Invoicing and returns
- Cash receipts and ledgers
- Expenses (business + home, separately)
- Investments and loans
- Reports including Profit & Loss with date filters
- Multiple business categories (Oil, Cigarettes, Zameen, etc.)
- Defaulter customer tracking
- Customer bill delivery via SMS / WhatsApp
- Automated and manual backups (Excel + database)

Replaces a legacy single-PC C# WinForms app with a multi-user web app installable as a PWA on phones.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend:** Supabase (Postgres + Auth + Realtime + Storage + Edge Functions)
- **Hosting:** Vercel (frontend) + Supabase (backend)
- **Other:** Twilio (SMS), Meta WhatsApp Cloud API, Resend (email)

## Quick Links for Developers

- **[CLAUDE.md](./CLAUDE.md)** — Instructions for Claude Code (read first)
- **[MEMORY.md](./MEMORY.md)** — Current project state and progress tracker
- **[DECISIONS.md](./DECISIONS.md)** — Architectural decision log
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Technical deep dive
- **[SETUP.md](./SETUP.md)** — Zero-to-running guide
- **[PROMPTS.md](./PROMPTS.md)** — Prompts for each build piece

## Project Status

🏗️ **In progress** — Phase 1 (Foundation)

Track progress in [MEMORY.md](./MEMORY.md).

## Running Locally

See [SETUP.md](./SETUP.md) for detailed instructions.

```bash
pnpm install
pnpm dev
```

App runs at http://localhost:3000.

## Building / Deploying

This project deploys automatically to Vercel from the `main` branch.

## License

Private — Khaliq Oil Company internal use only.
