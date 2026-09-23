-- ═══════════════════════════════════════════════════════════════
-- Balance corrections: the audit row joins the transaction, opening
-- balances become correctable, and a future date is refused
--
-- WHAT WAS ALREADY TRUE (0075, 0079)
--   A balance is the sum of its entries. A correction posts a dated adjustment
--   for the difference and never overwrites. Admin only, reason required, at
--   the database as well as in the app.
--
-- WHAT THIS ADDS
--
--   1. THE AUDIT ROW IS WRITTEN IN THE SAME TRANSACTION AS THE ENTRY
--      It was written by the server action after the RPC returned — a second
--      round trip, and logActivity() swallows its own errors by contract. So a
--      correction could exist with no record of who made it or why, if the
--      process died in between or the log insert failed. Moving it inside the
--      function makes the pair atomic: both rows commit, or neither does.
--
--      This is the requirement "a change can never exist without its log
--      entry", and it is the only one of these that could not be satisfied
--      from application code.
--
--   2. AN OPENING BALANCE CAN BE CORRECTED
--      p_field selects what is being fixed:
--        'outstanding' — where the account stands now  (the previous behaviour)
--        'opening'     — what it started at
--
--      An opening correction posts a further 'opening' row for the difference,
--      dated at the party's start, rather than editing the original. The
--      opening balance is therefore SUM of its 'opening' rows — still an entry,
--      never a loose field, and the original stays visible. Correcting the
--      opening also moves the outstanding balance by the same amount, which is
--      arithmetic, not a side effect.
--
--   3. A FUTURE EFFECTIVE DATE IS REFUSED
--      An entry dated next month silently misstates every report drawn between
--      now and then.
--
-- WHY THE SIGNATURES CHANGE
--   p_field is appended with a default, so every existing call keeps working
--   and keeps meaning what it meant. PostgREST resolves by argument name, so
--   the old 4- and 5-argument calls are dropped explicitly to avoid two
--   candidate overloads.
--
-- Down:
--   Re-run 0075 (section 3) and 0079 (section 4).
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- Both signatures go: the 5-argument one this migration replaces, and the
-- 6-argument one it creates. Dropping only the former made the migration fail
-- on a second run with 42723 — CREATE will not overwrite a function that is
-- already there, and adding p_field makes it a different signature rather than
-- a replacement, so CREATE OR REPLACE does not help either.
DROP FUNCTION IF EXISTS public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE);
DROP FUNCTION IF EXISTS public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT);

-- ─────────────────────────────────────────────
-- Customers
-- ─────────────────────────────────────────────
CREATE FUNCTION public.adjust_customer_balance(
  p_customer_id          UUID,
  p_business_id          UUID,
  p_target_balance_paisa BIGINT,
  p_reason               TEXT,
  p_entry_date           DATE DEFAULT NULL,
  p_field                TEXT DEFAULT 'outstanding'
)
RETURNS TABLE (
  old_balance_paisa BIGINT,
  new_balance_paisa BIGINT,
  difference_paisa  BIGINT,
  entry_id          UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role   TEXT := public.user_role();
  v_actor  UUID := auth.uid();
  v_old    BIGINT;
  v_diff   BIGINT;
  v_date   DATE;
  v_entry  UUID;
  v_name   TEXT;
  v_start  DATE;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can adjust a balance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_field NOT IN ('outstanding', 'opening') THEN
    RAISE EXCEPTION 'Unknown balance field: %', p_field USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required to adjust a balance'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.name, c.created_at::date INTO v_name, v_start
    FROM public.customers c
   WHERE c.id = p_customer_id
     AND c.business_id = p_business_id
     AND c.deleted_at IS NULL;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- An opening correction belongs at the start of the relationship; anything
  -- else defaults to today.
  v_date := COALESCE(p_entry_date, CASE WHEN p_field = 'opening' THEN v_start ELSE CURRENT_DATE END);

  IF v_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'An adjustment cannot be dated in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_field = 'opening' THEN
    SELECT COALESCE(SUM(le.debit_paisa - le.credit_paisa), 0) INTO v_old
      FROM public.ledger_entries le
     WHERE le.customer_id = p_customer_id AND le.ref_type = 'opening';
  ELSE
    SELECT COALESCE(SUM(le.debit_paisa - le.credit_paisa), 0) INTO v_old
      FROM public.ledger_entries le
     WHERE le.customer_id = p_customer_id;

    -- The column still contributes until it is zero everywhere.
    SELECT v_old + COALESCE(c.opening_balance_paisa, 0) INTO v_old
      FROM public.customers c WHERE c.id = p_customer_id;
  END IF;

  v_diff := p_target_balance_paisa - v_old;

  IF v_diff = 0 THEN
    RAISE EXCEPTION 'That is already the balance — nothing to adjust'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.ledger_entries
    (business_id, customer_id, ref_type, ref_id, entry_date,
     debit_paisa, credit_paisa, balance_paisa, description)
  VALUES
    (p_business_id, p_customer_id,
     CASE WHEN p_field = 'opening' THEN 'opening' ELSE 'adjustment' END,
     p_customer_id, v_date,
     GREATEST(v_diff, 0), GREATEST(-v_diff, 0),
     p_target_balance_paisa,
     CASE WHEN p_field = 'opening'
          THEN 'Opening balance corrected — ' || TRIM(p_reason)
          ELSE TRIM(p_reason) END)
  RETURNING id INTO v_entry;

  -- Same transaction as the entry above. If this fails, the correction does
  -- not happen either.
  INSERT INTO public.activity_log
    (business_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    p_business_id, v_actor, 'balance.adjusted', 'customer', p_customer_id,
    'Adjusted the ' || p_field || ' balance of ' || v_name,
    jsonb_build_object(
      'party_type', 'customer',
      'party_id', p_customer_id,
      'party_name', v_name,
      'field', p_field,
      'old_value_paisa', v_old,
      'new_value_paisa', p_target_balance_paisa,
      'difference_paisa', v_diff,
      'effective_date', v_date,
      'reason', TRIM(p_reason),
      'ledger_entry_id', v_entry
    )
  );

  RETURN QUERY SELECT v_old, p_target_balance_paisa, v_diff, v_entry;
END;
$$;

COMMENT ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) IS
  'Moves a customer''s opening or outstanding balance to a target figure by
   posting a dated entry for the difference, and writes its audit row in the
   same transaction. Admin only, reason required, no future dates.';

REVOKE ALL ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_customer_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- Suppliers — the same function, against the same rules
-- ─────────────────────────────────────────────
CREATE FUNCTION public.adjust_supplier_balance(
  p_supplier_id          UUID,
  p_business_id          UUID,
  p_target_balance_paisa BIGINT,
  p_reason               TEXT,
  p_entry_date           DATE DEFAULT NULL,
  p_field                TEXT DEFAULT 'outstanding'
)
RETURNS TABLE (
  old_balance_paisa BIGINT,
  new_balance_paisa BIGINT,
  difference_paisa  BIGINT,
  entry_id          UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role  TEXT := public.user_role();
  v_actor UUID := auth.uid();
  v_old   BIGINT;
  v_diff  BIGINT;
  v_date  DATE;
  v_entry UUID;
  v_name  TEXT;
  v_start DATE;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can adjust a balance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_field NOT IN ('outstanding', 'opening') THEN
    RAISE EXCEPTION 'Unknown balance field: %', p_field USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required to adjust a balance'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.name, s.created_at::date INTO v_name, v_start
    FROM public.suppliers s
   WHERE s.id = p_supplier_id
     AND s.business_id = p_business_id
     AND s.deleted_at IS NULL;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Supplier not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_date := COALESCE(p_entry_date, CASE WHEN p_field = 'opening' THEN v_start ELSE CURRENT_DATE END);

  IF v_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'An adjustment cannot be dated in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_field = 'opening' THEN
    SELECT COALESCE(SUM(adj.debit_paisa - adj.credit_paisa), 0) INTO v_old
      FROM public.supplier_ledger_entries adj
     WHERE adj.supplier_id = p_supplier_id AND adj.ref_type = 'opening';
  ELSE
    SELECT
      COALESCE((SELECT SUM(sp.total_paisa)  FROM public.stock_purchases sp
                 WHERE sp.supplier_id = p_supplier_id AND sp.deleted_at IS NULL), 0)
    - COALESCE((SELECT SUM(pay.amount_paisa) FROM public.supplier_payments pay
                 WHERE pay.supplier_id = p_supplier_id AND pay.deleted_at IS NULL), 0)
    + COALESCE((SELECT SUM(adj.debit_paisa - adj.credit_paisa)
                  FROM public.supplier_ledger_entries adj
                 WHERE adj.supplier_id = p_supplier_id), 0)
    INTO v_old;
  END IF;

  v_diff := p_target_balance_paisa - v_old;

  IF v_diff = 0 THEN
    RAISE EXCEPTION 'That is already the balance — nothing to adjust'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.supplier_ledger_entries
    (business_id, supplier_id, ref_type, entry_date,
     debit_paisa, credit_paisa, description, created_by)
  VALUES
    (p_business_id, p_supplier_id,
     CASE WHEN p_field = 'opening' THEN 'opening' ELSE 'adjustment' END,
     v_date,
     GREATEST(v_diff, 0), GREATEST(-v_diff, 0),
     CASE WHEN p_field = 'opening'
          THEN 'Opening balance corrected — ' || TRIM(p_reason)
          ELSE TRIM(p_reason) END,
     v_actor)
  RETURNING id INTO v_entry;

  INSERT INTO public.activity_log
    (business_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    p_business_id, v_actor, 'balance.adjusted', 'supplier', p_supplier_id,
    'Adjusted the ' || p_field || ' balance of ' || v_name,
    jsonb_build_object(
      'party_type', 'supplier',
      'party_id', p_supplier_id,
      'party_name', v_name,
      'field', p_field,
      'old_value_paisa', v_old,
      'new_value_paisa', p_target_balance_paisa,
      'difference_paisa', v_diff,
      'effective_date', v_date,
      'reason', TRIM(p_reason),
      'ledger_entry_id', v_entry
    )
  );

  RETURN QUERY SELECT v_old, p_target_balance_paisa, v_diff, v_entry;
END;
$$;

COMMENT ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) IS
  'The supplier twin of adjust_customer_balance. Same rules, same audit row in
   the same transaction.';

REVOKE ALL ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_supplier_balance(UUID, UUID, BIGINT, TEXT, DATE, TEXT) TO authenticated;
