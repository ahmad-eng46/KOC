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
