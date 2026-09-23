-- ═══════════════════════════════════════════════════════════════
-- Part A: applying an approved edit or delete to a stock purchase
--
-- WHAT WAS MISSING
--   stock_purchase is registered in the entity registry and can be REQUESTED
--   for deletion, but there is no case for it in the apply switch and it sits
--   in NO_DELETE_ACTION — so an admin approving one is told it cannot be done.
--   Staff have had no way to get a stock purchase removed at all.
--
-- WHY A FUNCTION RATHER THAN AN UPDATE FROM THE ACTION
--
--   1. stock_movements is IMMUTABLE. stock_movements_update and _delete are
--      both USING (false), deliberately: 0007 states that corrections are new
--      rows. So removing a purchase cannot delete its movement, and changing a
--      quantity cannot edit one. Both post a COMPENSATING row instead, which
--      is the same discipline the ledger uses for money.
--
--   2. total_paisa is not independent. stock_purchases_total_matches_inputs
--      CHECKs total_paisa = ROUND(quantity * unit_price_paisa), so quantity and
--      rate cannot move without it in the same statement.
--
--   3. The purchase and its compensating movement must land together or not at
--      all. A soft-deleted purchase whose stock was never reversed leaves the
--      shelf overstated, and nothing would ever detect it.
--
-- STOCK IS COMPUTED, NOT STORED
--   current_stock SUMs stock_movements; there is no quantity column anywhere.
--   So a reversal or an adjustment is immediately and automatically correct —
--   there is no running total to repair.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.delete_stock_purchase(UUID, UUID);
--   DROP FUNCTION IF EXISTS public.apply_stock_purchase_edit(UUID, UUID, JSONB);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Delete a purchase, and take its stock back off the shelf
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.delete_stock_purchase(UUID, UUID);

CREATE FUNCTION public.delete_stock_purchase(
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
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Admin only. Staff reach this by having a request approved, never directly;
  -- the request flow calls this as the approving admin.
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only an admin can delete a stock purchase'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT sp.quantity, sp.product_id INTO v_qty, v_product
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

  -- The goods never arrived, so take them back off. A new 'out' row rather
  -- than removing the original 'in': the movement ledger is append-only, and
  -- the pair records what happened rather than pretending it did not.
  INSERT INTO public.stock_movements
    (business_id, product_id, type, quantity, note, stock_purchase_id)
  VALUES
    (p_business_id, v_product, 'out', v_qty,
     'Reversal: purchase deleted', p_id);

  RETURN QUERY SELECT v_qty, v_product;
END;
$$;

COMMENT ON FUNCTION public.delete_stock_purchase(UUID, UUID) IS
  'Soft-deletes a purchase and posts an offsetting ''out'' movement so the
   stock it brought in leaves the shelf. Admin only; staff arrive here through
   an approved change request.';

REVOKE ALL ON FUNCTION public.delete_stock_purchase(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_stock_purchase(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 2. Apply an approved edit
--
--    Accepts a partial row. Only these four may move:
--      quantity, unit_price_paisa, purchase_date, notes
--    Supplier and product are absent on purpose — changing either is really a
--    different purchase, and would strand the movement this one created.
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.apply_stock_purchase_edit(UUID, UUID, JSONB);

CREATE FUNCTION public.apply_stock_purchase_edit(
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
         sp.purchase_date, sp.notes
    INTO v_old_qty, v_old_rate, v_product, v_new_date, v_new_notes
    FROM public.stock_purchases sp
   WHERE sp.id = p_id
     AND sp.business_id = p_business_id
     AND sp.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock purchase not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Absent keys keep their current value; present keys replace it.
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

  -- total_paisa moves with them, or the CHECK rejects the write.
  UPDATE public.stock_purchases
     SET quantity         = v_new_qty,
         unit_price_paisa = v_new_rate,
         total_paisa      = ROUND(v_new_qty * v_new_rate)::BIGINT,
         purchase_date    = v_new_date,
         notes            = v_new_notes
   WHERE id = p_id;

  -- A quantity change is a stock change. Posted as a signed 'adjustment',
  -- because the original 'in' row cannot be edited and should not be: what
  -- arrived, and what was later corrected, are two facts and stay two rows.
  v_delta := v_new_qty - v_old_qty;
  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements
      (business_id, product_id, type, quantity, note, stock_purchase_id)
    VALUES
      (p_business_id, v_product, 'adjustment', v_delta,
       'Correction: purchase quantity changed', p_id);
  END IF;

  RETURN QUERY SELECT v_old_qty, v_new_qty, v_old_rate, v_new_rate, v_delta;
END;
$$;

COMMENT ON FUNCTION public.apply_stock_purchase_edit(UUID, UUID, JSONB) IS
  'Applies an approved edit to a purchase: quantity, rate, date and notes only.
   Keeps total_paisa in step with its CHECK and posts a signed adjustment
   movement when the quantity moves. Admin only.';

REVOKE ALL ON FUNCTION public.apply_stock_purchase_edit(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stock_purchase_edit(UUID, UUID, JSONB) TO authenticated;
