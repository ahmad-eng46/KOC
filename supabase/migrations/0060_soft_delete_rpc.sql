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
