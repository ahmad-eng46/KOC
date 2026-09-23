-- ═══════════════════════════════════════════════════════════════
-- Part A: file an EDIT request through the same door as a deletion
--
-- file_deletion_request (0062) is how a non-admin raises a request. It has to
-- be SECURITY DEFINER because the request must carry a snapshot of the whole
-- row, and the requester is precisely the person who cannot read all of it —
-- a product or a stock purchase holds a cost price (iron rule #3).
--
-- An edit needs the same door for the same reason, so the function gains two
-- parameters rather than being copied. Both have defaults, so every existing
-- caller keeps working untouched and files a deletion exactly as before.
--
-- WHAT IS CHECKED HERE RATHER THAN IN THE APP
--   * only 'edit' and 'delete' exist
--   * an edit must propose something; a delete must propose nothing
--   * the duplicate check is now per (entity, action), matching the index in
--     0072 — previously it asked only about the entity, so filing an edit on a
--     record with a delete pending was refused with a message about deletion
--   * for an edit, only the fields a requester may propose are accepted.
--     Anything else is dropped rather than rejected: a client sending
--     business_id or id is confused, not malicious, and silently ignoring the
--     keys keeps the allow-list in one place instead of two.
--
-- Down:
--   Recreate the 6-argument function from 0062 and drop this 8-argument one:
--   DROP FUNCTION IF EXISTS public.file_deletion_request(
--     TEXT, UUID, UUID, TEXT, TEXT, JSONB, TEXT, JSONB);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- The 6-argument signature is replaced outright. Leaving it in place would
-- leave two overloads, and PostgREST would have to guess between them.
DROP FUNCTION IF EXISTS public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB, TEXT, JSONB);

CREATE FUNCTION public.file_deletion_request(
  p_entity_type     TEXT,
  p_entity_id       UUID,
  p_business_id     UUID,
  p_display_name    TEXT,
  p_reason          TEXT  DEFAULT NULL,
  p_metadata        JSONB DEFAULT '{}',
  p_action          TEXT  DEFAULT 'delete',
  p_proposed_changes JSONB DEFAULT NULL
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
  v_changes  JSONB;
BEGIN
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admins change records directly rather than filing a request'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action NOT IN ('edit', 'delete') THEN
    RAISE EXCEPTION 'Unknown action: %', p_action
      USING ERRCODE = 'invalid_parameter_value';
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

  -- ── what an edit may propose ──
  IF p_action = 'edit' THEN
    IF p_proposed_changes IS NULL OR jsonb_typeof(p_proposed_changes) <> 'object' THEN
      RAISE EXCEPTION 'An edit request must say what should change'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Only these fields, and only for a stock purchase. Supplier and product
    -- are absent deliberately: changing either is a different purchase, and
    -- would strand the stock movement this one created.
    IF p_entity_type = 'stock_purchase' THEN
      SELECT jsonb_object_agg(key, value) INTO v_changes
        FROM jsonb_each(p_proposed_changes)
       WHERE key IN ('quantity', 'unit_price_paisa', 'purchase_date', 'notes');
    ELSE
      RAISE EXCEPTION 'Edit requests are not supported for % yet', p_entity_type
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RAISE EXCEPTION 'None of those fields can be changed by request'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Proposing what is already there is not a change worth an admin's time.
    IF v_snapshot @> v_changes THEN
      RAISE EXCEPTION 'Those values are already what the record says'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    v_changes := NULL;
  END IF;

  -- Per action, matching idx_change_requests_one_pending. The index is the
  -- guarantee; this only buys a sentence instead of a constraint name.
  IF EXISTS (
    SELECT 1 FROM public.deletion_requests
     WHERE business_id = p_business_id AND entity_type = p_entity_type
       AND entity_id = p_entity_id AND status = 'pending'
       AND action = p_action
  ) THEN
    IF p_action = 'edit' THEN
      RAISE EXCEPTION 'Someone has already asked for this to be changed'
        USING ERRCODE = 'unique_violation';
    ELSE
      RAISE EXCEPTION 'Someone has already asked for this to be deleted'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  INSERT INTO public.deletion_requests (
    business_id, requested_by, entity_type, entity_id,
    entity_display_name, reason, entity_metadata, entity_snapshot,
    action, proposed_changes
  ) VALUES (
    p_business_id, auth.uid(), p_entity_type, p_entity_id,
    p_display_name, NULLIF(TRIM(COALESCE(p_reason, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb), v_snapshot,
    p_action, v_changes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB, TEXT, JSONB) IS
  'Files a change request — edit or delete — on behalf of a non-admin, taking
   the row snapshot with elevated rights because the requester cannot read all
   of it. Edits accept only the fields a requester may propose.';

REVOKE ALL ON FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_deletion_request(TEXT, UUID, UUID, TEXT, TEXT, JSONB, TEXT, JSONB) TO authenticated;
