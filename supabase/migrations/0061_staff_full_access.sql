-- ═══════════════════════════════════════════════════════════════
-- Staff get everything except destroying, escalating, and cost prices
--
-- The role model changes shape here. Until now staff were defined by a short
-- list of what they could reach; from here they are defined by four things
-- they cannot, and everything else is theirs. lib/auth/permissions.ts states
-- the same rule by subtraction so the two cannot drift.
--
-- WHAT STAFF DO NOT GET, and why each one stays:
--
--   1. DELETE, on any table. Not widened anywhere below, and there is nothing
--      to widen — every _delete policy in this schema is already
--      USING (false). Staff delete by asking; 0054's deletion_requests is the
--      route and 0060's soft_delete_entity() refuses anyone but an admin.
--
--   2. users, user_businesses, user_page_access, user_permission_overrides,
--      businesses, and writes to app_settings. A staff member who can edit
--      users can make themselves an admin, and an admin approves their own
--      deletion requests. Granting these would not widen staff access, it
--      would remove the role model.
--
--   3. audit_log and backups. Both hold cost prices in the clear —
--      audit_log stores whole rows as before/after JSON, and a backup is the
--      database. Granting either would hand staff purchase_price_paisa
--      through the back door, so iron rule #3 keeps them out.
--
--   4. Cost prices themselves. products and stock_purchases keep their
--      admin/accountant SELECT on the base table; staff read
--      products_for_role and stock_purchases_for_role, which NULL the money
--      columns. This is why products_select and stock_purchases_select are
--      conspicuously absent below.
--
-- On products and stock_purchases: staff INSERT directly (0058) and UPDATE
-- through update_product_as_role(), because a table whose SELECT policy
-- excludes you cannot be updated by you — the WHERE clause has nothing to
-- match. Same reason 0060 exists. Adding staff to those SELECT policies to
-- work around it is exactly the leak (3) forbids.
--
-- Down:
--   Re-run 0017, 0040, 0043, 0044, 0042, 0053 and 0058 in that order to
--   restore the narrower policies, then set default_staff = false on the page
--   rows listed at the end.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. RLS: add staff wherever admin and accountant already are
--
--    Done as a loop over (table, command) pairs rather than 40 hand-written
--    CREATE POLICY blocks. Each policy is altered in place, so its existing
--    expression is preserved exactly and only the role list widens — there is
--    no second copy of any predicate to fall out of step.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  r          RECORD;
  v_qual     TEXT;
  v_check    TEXT;
  v_new_qual TEXT;
  v_new_chk  TEXT;
BEGIN
  FOR r IN
    SELECT p.policyname, p.tablename, p.cmd, p.qual, p.with_check
      FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.cmd IN ('SELECT', 'INSERT', 'UPDATE')
       AND p.tablename IN (
         -- Every business entity. Deliberately excludes users,
         -- user_businesses, user_page_access, user_permission_overrides,
         -- businesses, app_settings, audit_log, backups, products and
         -- stock_purchases — see the header.
         'customers', 'customer_categories',
         'invoices', 'invoice_items',
         'payments', 'expenses', 'expense_assets', 'expense_sub_types',
         'returns', 'return_items',
         'suppliers', 'supplier_payments',
         'brands', 'locations',
         'investments', 'loans',
         'ledger_entries', 'stock_movements', 'activity_log'
       )
       -- Only policies that name roles at all, and that already admit an
       -- accountant. A policy open to everyone signed in needs nothing; one
       -- restricted to admin alone is restricted on purpose.
       AND COALESCE(p.qual, p.with_check) LIKE '%accountant%'
       AND COALESCE(p.qual, p.with_check) NOT LIKE '%staff%'
  LOOP
    v_qual  := r.qual;
    v_check := r.with_check;

    v_new_qual := replace(v_qual,  '''accountant''', '''accountant'', ''staff''');
    v_new_chk  := replace(v_check, '''accountant''', '''accountant'', ''staff''');

    IF v_qual IS NOT NULL AND v_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                     r.policyname, r.tablename, v_new_qual, v_new_chk);
    ELSIF v_qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                     r.policyname, r.tablename, v_new_qual);
    ELSIF v_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                     r.policyname, r.tablename, v_new_chk);
    END IF;

    RAISE NOTICE 'staff added to %.% (%)', r.tablename, r.policyname, r.cmd;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- 1b. investments and loans
--
--     The loop above cannot reach these: it widens policies that already name
--     an accountant, and 0017 wrote their INSERT and UPDATE as admin alone.
--     They are business entities like any other, so staff get them — and
--     permissions.ts grants investments.create and loans.create, so leaving
--     the database narrower here is exactly the disagreement between layers
--     that this part exists to remove.
--
--     Worth knowing when reading the books: these two tables are the owner's
--     own capital in and out. Nothing here is destructive and the audit log
--     records every write, but if the intent was that staff never see the
--     owner's personal position, this block and the two matching lines in
--     permissions.ts are the pair to change together.
-- ─────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('investments', 'loans')
       AND cmd IN ('INSERT', 'UPDATE')
       AND COALESCE(qual, with_check) NOT LIKE '%staff%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I %s %s',
      r.policyname, r.tablename,
      CASE WHEN r.qual IS NULL THEN ''
           ELSE 'USING (' || replace(r.qual,
                  'user_role() = ''admin''::text',
                  'user_role() = ANY (ARRAY[''admin''::text, ''staff''::text])') || ')'
      END,
      CASE WHEN r.with_check IS NULL THEN ''
           ELSE 'WITH CHECK (' || replace(r.with_check,
                  'user_role() = ''admin''::text',
                  'user_role() = ANY (ARRAY[''admin''::text, ''staff''::text])') || ')'
      END
    );
    RAISE NOTICE 'staff added to %.%', r.tablename, r.policyname;
  END LOOP;

  -- pg_policies deparses `user_role() = 'admin'` with an explicit ::text cast.
  -- If that ever changes shape the replace above becomes a no-op and the
  -- policy stays admin-only while permissions.ts says otherwise — the exact
  -- silent disagreement this migration exists to prevent. So it is checked.
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('investments', 'loans')
       AND cmd IN ('INSERT', 'UPDATE')
       AND COALESCE(qual, with_check) NOT LIKE '%staff%'
  LOOP
    RAISE EXCEPTION
      'could not widen %.% — the policy text did not match the expected shape',
      r.tablename, r.policyname;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. Every page and action, on for staff
--
--    Except the five that (2) and (3) above forbid, plus the approvals review
--    queue. /approvals itself stays on for everyone: the page is "Approvals"
--    for an admin and "My Deletion Requests" for everyone else, and RLS is
--    what narrows the rows.
-- ─────────────────────────────────────────────
--    The catalogue screens that live under /settings get their own keys here.
--    They were all mapped onto 'settings' before, which is the admin-only
--    app-configuration form — so opening brands and categories to staff while
--    leaving that mapping in place would have had the route guard bounce them
--    off pages the page itself now admits. lib/auth/page-access-rules.ts
--    carries the matching route entries.
INSERT INTO public.page_definitions
  (key, label, category, sort_order,
   default_admin, default_accountant, default_staff, default_viewer,
   is_lockable, permission_key)
VALUES
  ('settings.brands',     'Brands',            'settings', 5, true, true, true, false, false, 'products.view'),
  ('settings.categories', 'Customer Categories','settings', 6, true, true, true, false, false, 'customers.view'),
  ('settings.assets',     'Expense Assets',    'settings', 7, true, true, true, false, false, 'expenses.view'),
  ('settings.activity',   'Activity Log',      'settings', 8, true, true, true, false, false, NULL)
ON CONFLICT (key) DO UPDATE SET
  label              = EXCLUDED.label,
  category           = EXCLUDED.category,
  sort_order         = EXCLUDED.sort_order,
  default_admin      = EXCLUDED.default_admin,
  default_accountant = EXCLUDED.default_accountant,
  default_staff      = EXCLUDED.default_staff,
  default_viewer     = EXCLUDED.default_viewer,
  is_lockable        = EXCLUDED.is_lockable,
  permission_key     = EXCLUDED.permission_key;

UPDATE public.page_definitions
   SET default_staff = true
 WHERE key NOT IN (
   'settings',       -- app settings; settings.manage
   'users',          -- user management; privilege escalation
   'backup',         -- a backup is the database, cost prices included
   'reports.audit',  -- audit_log holds whole rows, cost prices included
   'action.view_cost_prices',
   'action.download_backup'
 );

-- is_lockable rows can never be granted to staff — 0056's trigger refuses the
-- per-user grant, and a default that the trigger would reject is a lie.
UPDATE public.page_definitions SET default_staff = false WHERE is_lockable;

DO $$
DECLARE
  v_open INT;
  v_shut INT;
BEGIN
  SELECT COUNT(*) FILTER (WHERE default_staff),
         COUNT(*) FILTER (WHERE NOT default_staff)
    INTO v_open, v_shut
    FROM public.page_definitions;

  IF v_open = 0 THEN
    RAISE EXCEPTION '0061 did not open anything — page_definitions may be unseeded';
  END IF;

  RAISE NOTICE '0061 applied: staff may reach % pages/actions; % remain admin-only.',
    v_open, v_shut;
END;
$$;
