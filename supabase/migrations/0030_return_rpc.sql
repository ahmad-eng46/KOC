-- ─────────────────────────────────────────────
-- create_return_atomic(p_input JSONB) RETURNS UUID
--
-- Single-transaction return creation:
--   1. Validates each item: qty <= (sold qty − already-returned qty)
--   2. Inserts row in returns         → fires trg_ledger_return (credit)
--   3. Inserts each return_items row
--   4. Inserts one stock_movements row per item (type='return')
--
-- SECURITY DEFINER so it can read invoice_items + already-returned counts
-- without depending on the caller's RLS view of those tables.
-- Caller authorisation: must belong to the invoice's business AND be
-- admin or accountant.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_return_atomic(p_input JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice_id     UUID := (p_input->>'invoice_id')::UUID;
  v_business_id    UUID;
  v_customer_id    UUID;
  v_invoice_number TEXT;
  v_user_id        UUID := auth.uid();
  v_user_role      TEXT;
  v_return_id      UUID;
  v_return_number  TEXT;
  v_count          INT;
  v_total          BIGINT := 0;
  v_item           JSONB;
  v_inv_item       RECORD;
  v_already_returned NUMERIC(12,3);
  v_qty            NUMERIC(12,3);
  v_unit_price     BIGINT;
  v_line_total     BIGINT;
  v_reason         TEXT := COALESCE(NULLIF(p_input->>'reason', ''), 'Return');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up invoice (must exist + not be deleted)
  SELECT business_id, customer_id, invoice_number
    INTO v_business_id, v_customer_id, v_invoice_number
    FROM public.invoices
   WHERE id = v_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Caller must belong to this business
  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  -- Caller must be admin or accountant
  SELECT role INTO v_user_role FROM public.users WHERE id = v_user_id;
  IF v_user_role NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Only admin or accountant can process returns';
  END IF;

  -- Must have at least one item
  IF jsonb_array_length(p_input->'items') = 0 THEN
    RAISE EXCEPTION 'Return must include at least one item';
  END IF;

  -- Generate return number: RET-NNNNN per business
  SELECT COUNT(*) INTO v_count FROM public.returns WHERE business_id = v_business_id;
  v_return_number := 'RET-' || LPAD((v_count + 1)::TEXT, 5, '0');

  -- Validate each item, accumulate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items')
  LOOP
    SELECT id, product_id, quantity, unit_price_paisa
      INTO v_inv_item
      FROM public.invoice_items
     WHERE id = (v_item->>'invoice_item_id')::UUID
       AND invoice_id = v_invoice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice item % does not belong to invoice %',
        v_item->>'invoice_item_id', v_invoice_id;
    END IF;

    -- Already returned for this invoice_item (across prior returns)
    SELECT COALESCE(SUM(ri.quantity), 0) INTO v_already_returned
      FROM public.return_items ri
      JOIN public.returns r ON r.id = ri.return_id
     WHERE ri.invoice_item_id = v_inv_item.id
       AND r.deleted_at IS NULL;

    v_qty := (v_item->>'quantity')::NUMERIC(12,3);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Return quantity must be > 0 (item %)', v_inv_item.id;
    END IF;

    IF v_qty > (v_inv_item.quantity - v_already_returned) THEN
      RAISE EXCEPTION
        'Return qty % exceeds remaining (sold %, already returned %, remaining %)',
        v_qty, v_inv_item.quantity, v_already_returned,
        (v_inv_item.quantity - v_already_returned);
    END IF;

    v_unit_price := v_inv_item.unit_price_paisa;
    v_line_total := ROUND(v_qty * v_unit_price);
    v_total := v_total + v_line_total;
  END LOOP;

  -- Insert returns row (trigger fires ledger credit)
  INSERT INTO public.returns (
    business_id, invoice_id, customer_id, return_number, return_date,
    total_paisa, notes, created_by
  ) VALUES (
    v_business_id, v_invoice_id, v_customer_id, v_return_number, CURRENT_DATE,
    v_total, v_reason, v_user_id
  ) RETURNING id INTO v_return_id;

  -- Insert return_items + stock_movements (type='return' adds back to stock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items')
  LOOP
    SELECT id, product_id, quantity, unit_price_paisa
      INTO v_inv_item
      FROM public.invoice_items
     WHERE id = (v_item->>'invoice_item_id')::UUID;

    v_qty := (v_item->>'quantity')::NUMERIC(12,3);
    v_unit_price := v_inv_item.unit_price_paisa;
    v_line_total := ROUND(v_qty * v_unit_price);

    INSERT INTO public.return_items (
      return_id, invoice_item_id, product_id, quantity, unit_price_paisa, line_total_paisa
    ) VALUES (
      v_return_id, v_inv_item.id, v_inv_item.product_id, v_qty, v_unit_price, v_line_total
    );

    INSERT INTO public.stock_movements (
      business_id, product_id, return_id, type, quantity, note
    ) VALUES (
      v_business_id, v_inv_item.product_id, v_return_id,
      'return', v_qty, 'Return ' || v_return_number
    );
  END LOOP;

  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_return_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_return_atomic(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_return_atomic(JSONB) IS
  'Atomic return creation. Validates per-item qty against (sold − already-returned),
   inserts returns + return_items + stock_movements (type=return).
   Trigger creates ledger credit. Admin or accountant only.';
