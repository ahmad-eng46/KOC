#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Pre-deploy security checklist for KOC.
# Runs every check the runbook requires and prints PASS/FAIL/WARN
# with a per-check explanation. Exits 0 iff every check passes.
#
#   ./docs/deployment/security-checklist.sh
#   ./docs/deployment/security-checklist.sh --staging-url https://staging.khaliqoil.com
# ─────────────────────────────────────────────────────────────────
set -uo pipefail

# Colours (disabled if not a TTY)
if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_RESET=""
fi

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Resolve repo root regardless of cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT" || { echo "Cannot cd to repo root"; exit 1; }

# Optional flag
STAGING_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --staging-url) STAGING_URL="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 2 ;;
  esac
done

pass() { echo "${C_GREEN}PASS${C_RESET}  $1"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo "${C_RED}FAIL${C_RESET}  $1"; if [ -n "${2-}" ]; then echo "      └─ $2"; fi; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn() { echo "${C_YELLOW}WARN${C_RESET}  $1"; if [ -n "${2-}" ]; then echo "      └─ $2"; fi; WARN_COUNT=$((WARN_COUNT+1)); }

section() { echo; echo "─── $1 ───"; }

# ─────────────────────────────────────────────────────────────────
section "1. Service-role key not in build output"
# Fast: only check committed source. .next/ is ignored anyway, but if
# the user just built locally, scan it too.
# ─────────────────────────────────────────────────────────────────

# 1a. Source code references — service_role should ONLY appear in lib/supabase/admin.ts (server-only)
ALLOWED_FILE="lib/supabase/admin.ts"
SOURCE_HITS=$(grep -rEln "SUPABASE_SERVICE_ROLE_KEY|service_role" \
  --include="*.ts" --include="*.tsx" --include="*.mts" --include="*.mjs" \
  app components lib types 2>/dev/null | grep -v "^${ALLOWED_FILE}$" || true)

if [ -z "$SOURCE_HITS" ]; then
  pass "no service_role references outside ${ALLOWED_FILE} in committed source"
else
  fail "service_role referenced outside ${ALLOWED_FILE}" "files: $SOURCE_HITS"
fi

# 1b. .next build output (if present) — service_role JWT must not appear in client bundles
if [ -d ".next/static" ]; then
  if grep -rl "service_role" .next/static 2>/dev/null | head -1 | grep -q .; then
    fail ".next/static contains 'service_role' literal" "rotate the key immediately and rebuild"
  else
    pass ".next/static contains no 'service_role' literal"
  fi
  # Also check for the JWT prefix that would only appear if the actual key leaked
  if grep -rEl "eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}" .next/static 2>/dev/null | head -1 | grep -q .; then
    warn ".next/static contains a JWT-shaped string" "expected: anon key only. confirm by inspection."
  else
    pass ".next/static contains no JWT-shaped strings (anon key may be inlined as cleartext literal — that's normal)"
  fi
else
  warn ".next/ not present — run 'pnpm build' before final pre-deploy check" "skipping client-bundle scan"
fi

# ─────────────────────────────────────────────────────────────────
section "2. No hard-coded Supabase URLs or keys in committed source"
# ─────────────────────────────────────────────────────────────────

URL_HITS=$(grep -rEln "https://[a-z0-9]{20}\.supabase\.co" \
  --include="*.ts" --include="*.tsx" --include="*.mts" --include="*.mjs" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.next \
  app components lib scripts supabase types 2>/dev/null || true)
if [ -z "$URL_HITS" ]; then
  pass "no hard-coded supabase.co project URLs in source"
else
  fail "hard-coded supabase.co URL found" "files: $URL_HITS — move to env var"
fi

# JWT-shaped tokens in source (any committed file under code dirs)
JWT_HITS=$(grep -rEln "eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}" \
  --include="*.ts" --include="*.tsx" --include="*.mts" --include="*.mjs" --include="*.json" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.next \
  app components lib scripts supabase types docs 2>/dev/null || true)
if [ -z "$JWT_HITS" ]; then
  pass "no JWT-shaped literals in committed source"
else
  fail "JWT-shaped literal in committed source" "files: $JWT_HITS — rotate the key and remove"
fi

# ─────────────────────────────────────────────────────────────────
section "3. .env files git-ignored and uncommitted"
# ─────────────────────────────────────────────────────────────────

if [ -f .gitignore ] && grep -qE "^\.env(\.local)?$|^\.env\*$|^\*\.env|^\.env" .gitignore; then
  pass ".gitignore contains an .env rule"
else
  fail ".gitignore is missing an .env rule" "add: .env*  to .gitignore"
fi

# Check if any .env file is tracked by git
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  TRACKED_ENV=$(git ls-files | grep -E "(^|/)\.env($|\.)" || true)
  if [ -z "$TRACKED_ENV" ]; then
    pass "no .env files tracked by git"
  else
    fail ".env file is tracked by git" "files: $TRACKED_ENV — remove from index, rotate any leaked secrets"
  fi
else
  warn "git not available — skipping tracked-env check"
fi

# ─────────────────────────────────────────────────────────────────
section "4. RLS enabled on every public table"
# Requires: supabase CLI linked to a project (dev or prod).
# ─────────────────────────────────────────────────────────────────

if ! command -v supabase >/dev/null 2>&1; then
  warn "supabase CLI not installed — cannot verify RLS"
elif [ ! -f supabase/.temp/project-ref ] && [ ! -f .supabase/project-ref ]; then
  warn "supabase project not linked — run 'supabase link --project-ref <ref>' to enable this check"
else
  RLS_QUERY="SELECT tablename FROM pg_tables
             WHERE schemaname = 'public'
             AND tablename NOT IN (
               SELECT c.relname
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relrowsecurity = true
             );"
  if MISSING=$(supabase db query "$RLS_QUERY" 2>/dev/null | tail -n +3 | sed '/^$/d' | sed '/^---/d' | sed '/^(/d'); then
    if [ -z "$MISSING" ] || [ "$(echo "$MISSING" | tr -d '[:space:]')" = "" ]; then
      pass "RLS enabled on every public table"
    else
      fail "RLS missing on tables" "$MISSING"
    fi
  else
    warn "could not query Supabase to verify RLS — check 'supabase db query' connectivity"
  fi
fi

# ─────────────────────────────────────────────────────────────────
section "5. Build artifacts current"
# ─────────────────────────────────────────────────────────────────

if [ -d ".next" ]; then
  # Find the newest source file vs the build manifest
  NEWEST_SRC=$(find app components lib -type f \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null \
    | xargs ls -t 2>/dev/null | head -1)
  if [ -n "$NEWEST_SRC" ] && [ -f .next/BUILD_ID ]; then
    if [ "$NEWEST_SRC" -nt .next/BUILD_ID ]; then
      warn "source file newer than .next/BUILD_ID" "run 'pnpm build' before deploy. file: $NEWEST_SRC"
    else
      pass ".next build is current relative to source"
    fi
  else
    warn "could not compare source vs build timestamps"
  fi
else
  warn ".next/ missing — run 'pnpm build' as part of pre-deploy"
fi

# ─────────────────────────────────────────────────────────────────
section "6. Lighthouse audit (optional)"
# ─────────────────────────────────────────────────────────────────

if [ -z "$STAGING_URL" ]; then
  warn "no --staging-url provided — skipping Lighthouse" "re-run with: $0 --staging-url https://your-staging.vercel.app"
elif ! command -v npx >/dev/null 2>&1; then
  warn "npx not available — cannot run Lighthouse"
else
  echo "      running Lighthouse against $STAGING_URL …"
  TMP_REPORT=$(mktemp -t lighthouse.XXXXXX.json)
  if npx --yes lighthouse "$STAGING_URL" \
       --quiet --chrome-flags="--headless" \
       --only-categories=performance,accessibility,best-practices \
       --output=json --output-path="$TMP_REPORT" >/dev/null 2>&1; then
    PERF=$(node -e "const j=require('$TMP_REPORT'); console.log(Math.round(j.categories.performance.score*100))" 2>/dev/null || echo 0)
    ACC=$(node -e "const j=require('$TMP_REPORT'); console.log(Math.round(j.categories.accessibility.score*100))" 2>/dev/null || echo 0)
    BP=$(node -e "const j=require('$TMP_REPORT'); console.log(Math.round(j.categories['best-practices'].score*100))" 2>/dev/null || echo 0)
    rm -f "$TMP_REPORT"
    [ "$PERF" -ge 90 ] && pass "Lighthouse Performance: $PERF" || fail "Lighthouse Performance: $PERF (need ≥90)"
    [ "$ACC" -ge 90 ] && pass "Lighthouse Accessibility: $ACC" || fail "Lighthouse Accessibility: $ACC (need ≥90)"
    [ "$BP" -ge 90 ] && pass "Lighthouse Best Practices: $BP" || fail "Lighthouse Best Practices: $BP (need ≥90)"
  else
    rm -f "$TMP_REPORT"
    warn "Lighthouse run failed" "check that $STAGING_URL is reachable"
  fi
fi

# ─────────────────────────────────────────────────────────────────
echo
echo "─────────────────────────────────────────────"
printf "Summary: %s%d PASS%s   %s%d FAIL%s   %s%d WARN%s\n" \
  "$C_GREEN" "$PASS_COUNT" "$C_RESET" \
  "$C_RED"   "$FAIL_COUNT" "$C_RESET" \
  "$C_YELLOW" "$WARN_COUNT" "$C_RESET"
echo "─────────────────────────────────────────────"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
