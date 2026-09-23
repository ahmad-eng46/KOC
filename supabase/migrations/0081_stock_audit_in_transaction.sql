-- ═══════════════════════════════════════════════════════════════
-- Stock changes write their audit row in the same transaction
--
-- THE GAP THIS CLOSES
--   Every stock mutation had two trails, and only one of them was safe:
--
--     audit_log      written by the audit_stock_purchases trigger (0040), in
--                    the same transaction. Always correct, but it records
--                    column diffs — it does not say "a purchase was deleted
--                    and 40 units came back off stock".
--
--     activity_log   the feed an admin actually reads, written by the server
--                    action AFTER the RPC returned. logActivity() swallows its
--                    own errors by contract, deliberately, so that a logging
--                    failure can never roll back an invoice. The cost of that
--                    choice is here: the stock moved, and the line explaining
--                    it can be missing with nobody any the wiser.
--
--   0080 fixed exactly this for balance corrections. This does the same for
--   the three functions that change stock, for the same reason: the record of
--   a change and the change itself should not be able to come apart.
--
-- WHAT CHANGES
--   Nothing about what these functions DO — the bodies are 0069 and 0073
--   unchanged, with one INSERT added before each RETURN. Same signatures, same
--   return shapes, same guards, so no caller needs to know.
--
-- AND IN THE APP
--   The matching logActivity() calls are removed in the same commit. Left in,
--   every correction would appear twice in the feed.
--
-- ON apply_stock_purchase_edit
--   This one gains a line it never had. The approval was logged
--   ('change.approved', about the request) but the stock movement it caused
--   was not, so an admin reading the feed could see that an edit was approved
--   and not what it did to stock.
--
-- CREATE OR REPLACE, not DROP and CREATE: the signatures are untouched, so
-- replacement is the honest operation and the migration is re-runnable by
-- construction rather than by remembering to drop both variants (0080's bug).
--
-- Down:
--   Re-run 0069 and 0073, and restore the logActivity() calls.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- Paisa as a person reads it, for the description line only. The numbers that
-- anything computes from live in metadata, as integers.
CREATE OR REPLACE FUNCTION public.qty_text(q NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  -- FM drops trailing zeros but leaves the decimal point: 100.000 comes out as
  -- "100.". Trimming it keeps whole numbers reading as whole numbers.
  SELECT TRIM(TRAILING '.' FROM TRIM(TO_CHAR(COALESCE(q, 0), 'FM999999990.999')))
$$;

CREATE OR REPLACE FUNCTION public.paisa_text(p BIGINT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$ SELECT 'Rs. ' || to_char(COALESCE(p, 0) / 100.0, 'FM999,999,999,990.00') $$;

-- ─────────────────────────────────────────────
-- 1. Correcting a rate (0069)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.correct_stock_purchase_rate(
  p_id                UUID,
  p_business_id       UUID,
  p_unit_price_paisa  BIGINT,
  p_sync_product_cost BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  old_unit_price_paisa BIGINT,
  new_unit_price_paisa BIGINT,
  old_total_paisa      BIGINT,
  new_total_paisa      BIGINT,
  product_cost_synced  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role       TEXT := public.user_role();
  v_quantity   NUMERIC(12,3);
  v_product_id UUID;
  v_old_price  BIGINT;
  v_old_total  BIGINT;
  v_new_total  BIGINT;
  v_is_latest  BOOLEAN;
  v_synced     BOOLEAN := FALSE;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Only admins and accountants can correct a purchase rate'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_unit_price_paisa IS NULL OR p_unit_price_paisa < 0 THEN
    RAISE EXCEPTION 'A purchase rate cannot be negative'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT sp.quantity, sp.product_id, sp.unit_price_paisa, sp.total_paisa
    INTO v_quantity, v_product_id, v_old_price, v_old_total
    FROM public.stock_purchases sp
   WHERE sp.id = p_id
     AND sp.business_id = p_business_id
     AND sp.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_new_total := ROUND(v_quantity * p_unit_price_paisa)::BIGINT;

  UPDATE public.stock_purchases
     SET unit_price_paisa = p_unit_price_paisa,
         total_paisa      = v_new_total
   WHERE id = p_id;

  IF p_sync_product_cost THEN
    SELECT sp.id = p_id INTO v_is_latest
      FROM public.stock_purchases sp
     WHERE sp.product_id = v_product_id
       AND sp.business_id = p_business_id
       AND sp.deleted_at IS NULL
     ORDER BY sp.purchase_date DESC, sp.created_at DESC
     LIMIT 1;

    IF COALESCE(v_is_latest, FALSE) THEN
      UPDATE public.products
         SET purchase_price_paisa = p_unit_price_paisa
       WHERE id = v_product_id
         AND business_id = p_business_id
         AND deleted_at IS NULL;
      v_synced := TRUE;
    END IF;
  END IF;

  INSERT INTO public.activity_log
    (business_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    p_business_id, auth.uid(), 'purchase.rate_corrected', 'stock_purchase', p_id,
    'Corrected a purchase rate from ' || public.paisa_text(v_old_price)
      || ' to ' || public.paisa_text(p_unit_price_paisa)
      || CASE WHEN v_synced THEN ' — the product''s cost price now matches' ELSE '' END,
    jsonb_build_object(
      'purchase_id', p_id,
      'product_id', v_product_id,
      'old_unit_price_paisa', v_old_price,
      'new_unit_price_paisa', p_unit_price_paisa,
      'old_total_paisa', v_old_total,
      'new_total_paisa', v_new_total,
      'product_cost_synced', v_synced
    )
  );

  RETURN QUERY SELECT v_old_price, p_unit_price_paisa, v_old_total, v_new_total, v_synced;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. Deleting a purchase (0073)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_stock_purchase(
  p_id          UUID,
  p_business_id UUID
)
RETURNS TABLE (quantity_reversed NUMERIC, product_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role     TEXT := public.user_role();
  v_qty      NUMERIC(12,3);
  v_product  UUID;
  v_total    BIGINT;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can delete a stock purchase'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sp.quantity, sp.product_id, sp.total_paisa INTO v_qty, v_product, v_total
    FROM public.stock_purchases sp
   WHERE sp.id = p_id
     AND sp.business_id = p_business_id
     AND sp.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock purchase not found' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.stock_purchases
     SET deleted_at = NOW()
   WHERE id = p_id;

  INSERT INTO public.stock_movements
    (business_id, product_id, type, quantity, note, stock_purchase_id)
  VALUES
    (p_business_id, v_product, 'out', v_qty,
     'Reversal: purchase deleted', p_id);

  INSERT INTO public.activity_log
    (business_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    p_business_id, auth.uid(), 'stock.adjusted', 'stock_purchase', p_id,
    'Deleted a stock purchase — ' || public.qty_text(v_qty)
      || ' unit(s) taken back off stock',
    jsonb_build_object(
      'purchase_id', p_id,
      'product_id', v_product,
      'quantity_reversed', v_qty,
      'old_value_paisa', v_total,
      'new_value_paisa', 0,
      'purchase_deleted', true
    )
  );

  RETURN QUERY SELECT v_qty, v_product;
END;
$$;

-- ─────────────────────────────────────────────
-- 3. Applying an approved edit (0073)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_stock_purchase_edit(
  p_id          UUID,
  p_business_id UUID,
  p_changes     JSONB
)
RETURNS TABLE (
  old_quantity NUMERIC,
  new_quantity NUMERIC,
  old_rate     BIGINT,
  new_rate     BIGINT,
  stock_delta  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role      TEXT := public.user_role();
  v_old_qty   NUMERIC(12,3);
  v_old_rate  BIGINT;
  v_product   UUID;
  v_new_qty   NUMERIC(12,3);
  v_new_rate  BIGINT;
  v_new_date  DATE;
  v_new_notes TEXT;
  v_delta     NUMERIC(12,3);
  v_old_total BIGINT;
  v_new_total BIGINT;
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can apply a stock purchase edit'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'No changes to apply' USING ERRCODE = 'check_violation';
  END IF;

  SELECT sp.quantity, sp.unit_price_paisa, sp.product_id,
         sp.purchase_date, sp.notes, sp.total_paisa
    INTO v_old_qty, v_old_rate, v_product, v_new_date, v_new_notes, v_old_total
    FROM public.stock_purchases sp
   WHERE sp.id = p_id
     AND sp.business_id = p_business_id
     AND sp.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock purchase not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_new_qty  := COALESCE((p_changes ->> 'quantity')::NUMERIC, v_old_qty);
  v_new_rate := COALESCE((p_changes ->> 'unit_price_paisa')::BIGINT, v_old_rate);
  IF p_changes ? 'purchase_date' THEN
    v_new_date := (p_changes ->> 'purchase_date')::DATE;
  END IF;
  IF p_changes ? 'notes' THEN
    v_new_notes := NULLIF(p_changes ->> 'notes', '');
  END IF;

  IF v_new_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero' USING ERRCODE = 'check_violation';
  END IF;
  IF v_new_rate < 0 THEN
    RAISE EXCEPTION 'A purchase rate cannot be negative' USING ERRCODE = 'check_violation';
  END IF;

  v_new_total := ROUND(v_new_qty * v_new_rate)::BIGINT;

  UPDATE public.stock_purchases
     SET quantity         = v_new_qty,
         unit_price_paisa = v_new_rate,
         total_paisa      = v_new_total,
         purchase_date    = v_new_date,
         notes            = v_new_notes
   WHERE id = p_id;

  v_delta := v_new_qty - v_old_qty;
  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements
      (business_id, product_id, type, quantity, note, stock_purchase_id)
    VALUES
      (p_business_id, v_product, 'adjustment', v_delta,
       'Correction: purchase quantity changed', p_id);
  END IF;

  INSERT INTO public.activity_log
    (business_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    p_business_id, auth.uid(), 'stock.adjusted', 'stock_purchase', p_id,
    'Applied an approved edit to a stock purchase — '
      || public.qty_text(v_old_qty) || ' → '
      || public.qty_text(v_new_qty) || ' unit(s), '
      || public.paisa_text(v_old_rate) || ' → ' || public.paisa_text(v_new_rate),
    jsonb_build_object(
      'purchase_id', p_id,
      'product_id', v_product,
      'old_quantity', v_old_qty,
      'new_quantity', v_new_qty,
      'old_unit_price_paisa', v_old_rate,
      'new_unit_price_paisa', v_new_rate,
      'old_value_paisa', v_old_total,
      'new_value_paisa', v_new_total,
      'stock_delta', v_delta,
      'applied_from_request', true
    )
  );

  RETURN QUERY SELECT v_old_qty, v_new_qty, v_old_rate, v_new_rate, v_delta;
END;
$$;
