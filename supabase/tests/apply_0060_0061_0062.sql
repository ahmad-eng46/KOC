-- ═══════════════════════════════════════════════════════════════
-- 0060 + 0061 + 0062, concatenated for the Supabase SQL editor.
--
-- For when `supabase db push` cannot authenticate. Paste this WHOLE file and
-- run it once. It is the three migration files joined in order, verbatim —
-- not a rewrite, so there is no second copy to drift from supabase/migrations/.
--
-- Safe to run more than once: all three are re-runnable end to end.
--
-- Click into the editor and make sure NOTHING is selected before you hit Run.
-- The editor runs your selection when there is one, and a fragment of this
-- will fail in confusing places.
--
-- The Results pane shows only the LAST statement, so a successful run looks
-- like "Success. No rows returned". That is correct — these are DDL. To see
-- what landed, run supabase/tests/status.sql afterwards.
-- ═══════════════════════════════════════════════════════════════


-- ###########################################################
-- ##  0060_soft_delete_rpc.sql
-- ###########################################################

-- ═══════════════════════════════════════════════════════════════
-- Soft delete actually works now. 0046/0047/0049/0057 did not fix it.
--
-- THE BUG
--   `UPDATE <t> SET deleted_at = now()` fails for an admin with
--   "new row violates row-level security policy", while updating any other
--   column on the same row succeeds.
--
-- THE REAL CAUSE, established by experiment on PostgreSQL 16 rather than by
-- reading the policies:
--
--   Postgres checks the NEW row of an UPDATE against the table's SELECT
--   policies, not only against the UPDATE policy's WITH CHECK. Every table
--   here has a _select policy carrying `deleted_at IS NULL`. Setting
--   deleted_at therefore produces a row the caller could not select, and the
--   UPDATE is refused.
--
--   Four experiments, each decisive:
--     1. drop the _select policy, change nothing else   -> soft delete SUCCEEDS
--     2. add an explicit WITH CHECK to the _update policy (what 0046, 0047,
--        0049 and 0057 all do)                          -> STILL FAILS
--     3. _select policy without the deleted_at filter   -> SUCCEEDS
--     4. _select policy filtering on is_active instead, then set is_active
--        false                                          -> FAILS the same way
--
--   (4) is the one that settles it: nothing about this is specific to
--   deleted_at. Any UPDATE that moves a row outside your own SELECT policy is
--   rejected. So the earlier migrations diagnosed the symptom correctly and the
--   mechanism wrongly; adding WITH CHECK to the UPDATE policy cannot help,
--   because the UPDATE policy was never what refused the write.
--
-- THE FIX
--   Two ways out. Dropping `deleted_at IS NULL` from every _select policy
--   would work and is not worth considering: every read in the application
--   would start returning deleted rows unless it filtered them itself, and
--   iron rule #4 exists so that cannot happen.
--
--   So the write moves instead. soft_delete_entity() is SECURITY DEFINER and
--   owned by the table owner, for which RLS is not enforced, so the UPDATE is
--   never measured against a SELECT policy. Every read path keeps its filter
--   untouched. The function re-imposes by hand what RLS was doing: caller must
--   be an admin, the row must be in a business they belong to, and it must not
--   already be deleted. Verified by experiment (5): identical policies,
--   identical row, delete succeeds through the function.
--
--   0046/0047/0049/0057 are left in place. Their explicit WITH CHECK clauses
--   are correct hygiene — an UPDATE policy should state what it accepts — they
--   simply were not the fix.
--
-- Generic on purpose: adding an entity later is one INSERT into
-- deletable_entities, not another copy of this function.
--
-- Down:
--   DROP FUNCTION public.soft_delete_entity(TEXT, UUID, UUID, TEXT);
--   DROP TABLE public.deletable_entities;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. The registry: entity type -> the table behind it
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deletable_entities (
  entity_type TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.deletable_entities IS
  'Entity types the deletion flow understands, and the table each one lives in.
   Registering a new entity is an INSERT here — no function needs rewriting.';

INSERT INTO public.deletable_entities (entity_type, table_name, label) VALUES
  ('invoice',           'invoices',            'Invoice'),
  ('customer',          'customers',           'Customer'),
  ('product',           'products',            'Product'),
  ('expense',           'expenses',            'Expense'),
  ('payment',           'payments',            'Payment'),
  ('return',            'returns',             'Return'),
  ('supplier',          'suppliers',           'Supplier'),
  ('stock_purchase',    'stock_purchases',     'Stock purchase'),
  ('supplier_payment',  'supplier_payments',   'Supplier payment'),
  ('brand',             'brands',              'Brand'),
  ('location',          'locations',           'Location'),
  ('customer_category', 'customer_categories', 'Customer category'),
  ('expense_asset',     'expense_assets',      'Expense asset'),
  ('expense_sub_type',  'expense_sub_types',   'Expense sub-type')
ON CONFLICT (entity_type) DO UPDATE SET
  table_name = EXCLUDED.table_name,
  label      = EXCLUDED.label;

ALTER TABLE public.deletable_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deletable_entities_select ON public.deletable_entities;
DROP POLICY IF EXISTS deletable_entities_write  ON public.deletable_entities;

-- Readable by anyone signed in: the UI needs the labels. Written only by
-- migration, like page_definitions.
CREATE POLICY deletable_entities_select ON public.deletable_entities
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY deletable_entities_write ON public.deletable_entities
  FOR ALL USING (false) WITH CHECK (false);

GRANT SELECT ON public.deletable_entities TO authenticated;

-- ─────────────────────────────────────────────
-- 2. The one soft delete in the system
--
--    Returns the row as it was, which is what the approvals queue stores as its
--    snapshot — captured here rather than by the caller so it cannot drift from
--    what was actually deleted.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_entity(
  p_entity_type TEXT,
  p_id          UUID,
  p_business_id UUID,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table    TEXT;
  v_snapshot JSONB;
  -- The ::TEXT casts below are load-bearing: without them plpgsql reads the
  -- appended literal as an array literal and fails on the first column it adds.
  v_sets     TEXT[] := ARRAY['deleted_at = NOW()'];
BEGIN
  -- RLS is not enforced for the owner of these tables, which is the whole
  -- point of this function, so every check RLS would have made is made here.
  IF public.user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only an admin can delete records'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT table_name INTO v_table
    FROM public.deletable_entities WHERE entity_type = p_entity_type;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown entity type: %', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Identifiers come from the registry above and go through %I; values are
  -- always parameters. No caller string reaches the statement text (rule #6).
  EXECUTE format(
    'SELECT to_jsonb(t) FROM public.%I t
      WHERE t.id = $1 AND t.business_id = $2 AND t.deleted_at IS NULL', v_table)
    INTO v_snapshot USING p_id, p_business_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Record not found, or already deleted'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- is_active and notes only where the table has them. Checked per table
  -- rather than assumed, so registering an entity never means auditing this
  -- function for columns it happens to mention.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'is_active'
  ) THEN
    v_sets := v_sets || 'is_active = false'::TEXT;
  END IF;

  IF p_notes IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'notes'
  ) THEN
    v_sets := v_sets || 'notes = $3'::TEXT;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %s WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
    v_table, array_to_string(v_sets, ', '))
    USING p_id, p_business_id, p_notes;

  RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_entity(TEXT, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_entity(TEXT, UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_entity(TEXT, UUID, UUID, TEXT) IS
  'The only soft delete in the system. Admin-only, business-scoped, returns the
   row as it was. SECURITY DEFINER because a SELECT policy filtering deleted_at
   otherwise refuses the very UPDATE that sets it.';

DO $$
BEGIN
  IF to_regclass('public.deletable_entities') IS NULL THEN
    RAISE EXCEPTION '0060 did not finish — registry missing';
  END IF;
  RAISE NOTICE '0060 applied: soft_delete_entity() is the delete path; % entity types registered',
    (SELECT COUNT(*) FROM public.deletable_entities);
END;
$$;

-- ###########################################################
-- ##  0061_staff_full_access.sql
-- ###########################################################

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

-- ###########################################################
-- ##  0062_deletion_requests_part_c.sql
-- ###########################################################

-- ═══════════════════════════════════════════════════════════════
-- Deletion requests: optional reason, a real snapshot, one registry
--
-- 0054 built the queue. Three things change here.
--
-- 1. THE REASON BECOMES OPTIONAL.
--    0054 made it NOT NULL with a >= 5 character CHECK, on the reasoning that
--    a reason is the point of the exercise. The brief for this round asks for
--    an optional one, so it is optional. A staff member who cannot delete a
--    duplicate invoice without first composing a sentence about it will
--    either write "dup" or ask someone else to do it, and neither leaves the
--    admin better informed than a blank field honestly would.
--
-- 2. A REAL SNAPSHOT, CAPTURED WHERE IT CAN BE READ.
--    entity_metadata holds the handful of fields the approval card shows.
--    entity_snapshot now holds the whole row as it was at request time, so
--    the queue still describes the record after it has changed or gone.
--
--    It cannot be captured by the requester. Since 0058 and 0061 staff file
--    requests against products and stock purchases, and those are exactly the
--    two tables staff may not SELECT — the cost price lives there. A snapshot
--    taken with the requester's own rights would come back empty and the
--    request would fail with "Product not found".
--
--    So file_deletion_request() takes it, SECURITY DEFINER. Which creates the
--    opposite problem: the snapshot now contains purchase_price_paisa, and
--    deletion_requests_select lets a requester read their own rows. Hence the
--    view below, which NULLs the snapshot for anyone who may not see cost
--    prices. The requester sees their request; they do not see through it.
--
-- 3. ONE REGISTRY.
--    entity_type was a hardcoded CHECK listing fourteen strings, which meant
--    registering an entity was two edits in two migrations that could disagree.
--    It is now a foreign key to 0060's deletable_entities. Registering a new
--    entity is one INSERT there and nothing else.
--
-- Down:
--   ALTER TABLE public.deletion_requests
--     DROP CONSTRAINT deletion_requests_entity_type_fk,
--     DROP COLUMN entity_snapshot,
--     ALTER COLUMN reason SET NOT NULL;
--   ALTER TABLE public.deletion_requests RENAME COLUMN review_note TO rejection_reason;
--   DROP VIEW public.deletion_requests_for_role;
--   DROP FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Optional reason
-- ─────────────────────────────────────────────
ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_reason_present;

ALTER TABLE public.deletion_requests
  ALTER COLUMN reason DROP NOT NULL;

-- An empty string is not a reason either; store the absence as NULL so the UI
-- has one thing to test rather than two.
UPDATE public.deletion_requests SET reason = NULL WHERE TRIM(COALESCE(reason, '')) = '';

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_reason_not_blank;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_reason_not_blank
  CHECK (reason IS NULL OR LENGTH(TRIM(reason)) > 0);

-- ─────────────────────────────────────────────
-- 2. review_note replaces rejection_reason
--
--    An admin approving a request has as much reason to leave a note as one
--    rejecting it. resolved_by and resolved_at keep their names: 'cancelled'
--    is a resolution but not a review, and those two columns carry it.
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'deletion_requests'
       AND column_name = 'rejection_reason'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'deletion_requests'
       AND column_name = 'review_note'
  ) THEN
    ALTER TABLE public.deletion_requests RENAME COLUMN rejection_reason TO review_note;
  END IF;
END;
$$;

ALTER TABLE public.deletion_requests
  ADD COLUMN IF NOT EXISTS review_note TEXT;

-- ─────────────────────────────────────────────
-- 3. The snapshot
-- ─────────────────────────────────────────────
ALTER TABLE public.deletion_requests
  ADD COLUMN IF NOT EXISTS entity_snapshot JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.deletion_requests.entity_snapshot IS
  'The whole row as it was when the request was filed. May contain cost prices,
   so it is served through deletion_requests_for_role, never read directly.';

-- ─────────────────────────────────────────────
-- 4. entity_type follows the registry
-- ─────────────────────────────────────────────
ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_entity_type_valid;

ALTER TABLE public.deletion_requests
  DROP CONSTRAINT IF EXISTS deletion_requests_entity_type_fk;
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_entity_type_fk
  FOREIGN KEY (entity_type) REFERENCES public.deletable_entities(entity_type);

-- ─────────────────────────────────────────────
-- 5. Filing a request
--
--    SECURITY DEFINER only so the snapshot can be taken; every check RLS made
--    is repeated here. Admins are refused deliberately: an admin deletes, and
--    a request an admin could file is a request that same admin would approve.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.file_deletion_request(
  p_entity_type  TEXT,
  p_entity_id    UUID,
  p_business_id  UUID,
  p_display_name TEXT,
  p_reason       TEXT DEFAULT NULL,
  p_metadata     JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_table    TEXT;
  v_snapshot JSONB;
  v_role     TEXT := public.user_role();
  v_id       UUID;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admins delete directly rather than filing a request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT table_name INTO v_table
    FROM public.deletable_entities WHERE entity_type = p_entity_type;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown entity type: %', p_entity_type
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  EXECUTE format(
    'SELECT to_jsonb(t) FROM public.%I t
      WHERE t.id = $1 AND t.business_id = $2 AND t.deleted_at IS NULL', v_table)
    INTO v_snapshot USING p_entity_id, p_business_id;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Record not found, or already deleted'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The partial unique index on (business_id, entity_type, entity_id) WHERE
  -- status = 'pending' is what actually guarantees this; checking first only
  -- buys a sentence instead of a constraint name.
  IF EXISTS (
    SELECT 1 FROM public.deletion_requests
     WHERE business_id = p_business_id AND entity_type = p_entity_type
       AND entity_id = p_entity_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Someone has already asked for this to be deleted'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public.deletion_requests (
    business_id, requested_by, entity_type, entity_id,
    entity_display_name, reason, entity_metadata, entity_snapshot
  ) VALUES (
    p_business_id, auth.uid(), p_entity_type, p_entity_id,
    p_display_name, NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb), v_snapshot
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB) TO authenticated;

-- ─────────────────────────────────────────────
-- 6. The read path
--
--    Same shape as products_for_role: the snapshot is a whole row, so for a
--    product it holds purchase_price_paisa. A requester may see their own
--    request without seeing through it to the cost price (iron rule #3).
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.deletion_requests_for_role;

CREATE VIEW public.deletion_requests_for_role AS
SELECT
  dr.id,
  dr.business_id,
  dr.requested_by,
  dr.requested_at,
  dr.entity_type,
  dr.entity_id,
  dr.entity_display_name,
  dr.reason,
  dr.status,
  dr.resolved_by,
  dr.resolved_at,
  dr.review_note,
  dr.entity_metadata,
  -- Names as plain columns. PostgREST embeds through foreign keys, and a view
  -- carries none, so `users!fk(full_name)` cannot follow the request here. The
  -- join belongs in the view or every caller ends up making a second query.
  requester.full_name AS requester_name,
  resolver.full_name  AS resolver_name,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN dr.entity_snapshot
    ELSE NULL
  END AS entity_snapshot,
  dr.created_at
FROM public.deletion_requests dr
LEFT JOIN public.users requester ON requester.id = dr.requested_by
LEFT JOIN public.users resolver  ON resolver.id  = dr.resolved_by
WHERE public.user_has_business(dr.business_id)
  AND (
    public.user_role() IN ('admin', 'accountant')
    OR dr.requested_by = auth.uid()
  );

GRANT SELECT ON public.deletion_requests_for_role TO authenticated;

-- The base table stops being readable by requesters. Serving the snapshot
-- through a view while leaving the table itself open would be decoration: a
-- staff member could ask PostgREST for deletion_requests directly and read
-- entity_snapshot, cost price and all. The view runs with the owner's rights,
-- so it can still show them their own requests once this policy no longer does.
DROP POLICY IF EXISTS deletion_requests_select ON public.deletion_requests;
CREATE POLICY deletion_requests_select ON public.deletion_requests
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

COMMENT ON VIEW public.deletion_requests_for_role IS
  'The approvals queue as each role may see it. Admin and accountant see the
   snapshot; a requester sees their own requests with the snapshot withheld,
   because a whole-row snapshot of a product contains its cost price.';

-- ─────────────────────────────────────────────
-- 6b. products_for_role gains brand_name
--
--     The approval card names the brand, and it read it by embedding
--     brands(name) through the products table. Staff cannot read that table,
--     so the preview now goes through products_for_role — and PostgREST cannot
--     embed through a view, which has no foreign keys to follow. Rather than
--     drop the brand from the card, the view carries the name.
--
--     Additive: every existing SELECT on this view keeps working, and the cost
--     price stays NULLed exactly as 0050 left it.
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.products_for_role;

CREATE VIEW public.products_for_role AS
SELECT
  p.id,
  p.business_id,
  p.name,
  p.sku,
  p.unit,
  p.pack_size,
  p.pack_name,
  p.sale_price_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN p.purchase_price_paisa
    ELSE NULL
  END AS purchase_price_paisa,
  p.low_stock_threshold,
  p.brand_id,
  b.name AS brand_name,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.deleted_at
FROM public.products p
LEFT JOIN public.brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
WHERE public.user_has_business(p.business_id)
  AND p.deleted_at IS NULL;

GRANT SELECT ON public.products_for_role TO authenticated;

-- ─────────────────────────────────────────────
-- 7. Withdrawing your own request
--
--    Closing the table in (6) took the requester's cancel with it. An UPDATE's
--    WHERE clause is filtered by the SELECT policy, so a staff member
--    cancelling would match zero rows and be told it worked — the same silent
--    failure 0060 exists to remove. So cancelling becomes a function too.
--
--    Only your own, only while pending. resolved_by stays NULL deliberately:
--    nobody decided this, the requester withdrew it, and 0054's CHECK allows
--    exactly that shape for 'cancelled'.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_deletion_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner  UUID;
  v_status TEXT;
BEGIN
  SELECT requested_by, status INTO v_owner, v_status
    FROM public.deletion_requests WHERE id = p_request_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'You can only withdraw your own requests'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'That request has already been %', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.deletion_requests
     SET status = 'cancelled', resolved_at = NOW()
   WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_deletion_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_deletion_request(UUID) TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.deletion_requests_for_role') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'file_deletion_request')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cancel_deletion_request') THEN
    RAISE EXCEPTION '0062 did not finish';
  END IF;
  RAISE NOTICE '0062 applied: reason optional, snapshots captured, entity types come from the registry.';
END;
$$;
