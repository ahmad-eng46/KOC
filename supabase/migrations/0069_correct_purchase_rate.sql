-- ═══════════════════════════════════════════════════════════════
-- Correct the rate on a purchase already recorded
--
-- A purchase was enterable but never correctable: stock_purchases had no write
-- path in the app at all, so a rate typed wrongly stayed wrong, and the only
-- workaround was to record a second purchase that never happened.
--
-- Why an RPC rather than a plain UPDATE from the action:
--
--   1. total_paisa is not independent. stock_purchases_total_matches_inputs
--      CHECKs that total_paisa = ROUND(quantity * unit_price_paisa), so the two
--      must move together or the write is rejected. Doing that in one statement
--      leaves no window where the row is inconsistent.
--
--   2. Syncing the product's cost needs rights the corrector may not have.
--      create_stock_purchase_atomic (0040) sets products.purchase_price_paisa
--      to the rate of each new purchase, so a corrected latest purchase should
--      leave the product's cost corrected too. But products_update is
--      admin-only, and accountants are exactly the people who record
--      purchases. SECURITY DEFINER lets the sync happen for both roles while
--      this function — not the caller — decides who may do it.
--
--   3. Only the LATEST purchase syncs. An older one is history; propagating it
--      forward would overwrite a newer, correct cost with an older one.
--
-- What moves as a result:
--   supplier_balance_view  — recomputes on read (SUM of total_paisa), so a
--                            supplier's payable corrects itself immediately.
--   products.purchase_price — only when syncing the latest purchase.
--   invoice_items          — untouched. purchase_price_at_sale_paisa is a
--                            snapshot, so COGS on invoices already issued does
--                            not silently move under a correction.
--
-- Returns the previous rate so the caller can record what changed.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.correct_stock_purchase_rate(UUID, UUID, BIGINT, BOOLEAN);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.correct_stock_purchase_rate(UUID, UUID, BIGINT, BOOLEAN);

CREATE FUNCTION public.correct_stock_purchase_rate(
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

  -- Staff are absent on purpose: products_for_role and stock_purchases_for_role
  -- both NULL the cost for them, so they cannot see the figure they would be
  -- correcting (iron rule #3).
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

  -- Is this the product's most recent purchase? purchase_date first, then
  -- created_at, so two purchases entered for the same day still order.
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

  RETURN QUERY SELECT v_old_price, p_unit_price_paisa, v_old_total, v_new_total, v_synced;
END;
$$;

COMMENT ON FUNCTION public.correct_stock_purchase_rate(UUID, UUID, BIGINT, BOOLEAN) IS
  'Correct the rate on a recorded purchase, keeping total_paisa in step with its
   CHECK constraint. Syncs products.purchase_price_paisa only when the corrected
   row is that product''s latest purchase. Admin and accountant only.';

REVOKE ALL ON FUNCTION public.correct_stock_purchase_rate(UUID, UUID, BIGINT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_stock_purchase_rate(UUID, UUID, BIGINT, BOOLEAN) TO authenticated;
