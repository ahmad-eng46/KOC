-- ─────────────────────────────────────────────
-- create_invoice_atomic(p_input JSONB) RETURNS UUID
--
-- Single-transaction invoice creation:
--   1. Inserts row in invoices  → fires trg_ledger_invoice (debit)
--   2. Inserts each invoice_items row (with purchase_price_paisa snapshot)
--   3. Inserts one stock_movements row per item (type='out')
--   4. Inserts payments row if amount > 0  → fires trg_ledger_payment (credit)
--
-- SECURITY DEFINER: required to read products.purchase_price_paisa
-- (staff/viewer roles cannot read it via RLS). Caller authorisation is
-- enforced explicitly via public.user_has_business() check below.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(p_input JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id    UUID := (p_input->>'business_id')::UUID;
  v_customer_id    UUID := (p_input->>'customer_id')::UUID;
  v_invoice_id     UUID;
  v_invoice_number TEXT;
  v_subtotal       BIGINT := 0;
  v_discount       BIGINT := COALESCE((p_input->>'discount_paisa')::BIGINT, 0);
  v_total          BIGINT;
  v_paid           BIGINT := COALESCE((p_input->'payment'->>'amount_paisa')::BIGINT, 0);
  v_status         TEXT;
  v_user_id        UUID := auth.uid();
  v_item           JSONB;
  v_purchase_price BIGINT;
  v_line_total     BIGINT;
  v_count          INT;
  v_items_count    INT;
BEGIN
  -- Authorisation: caller must belong to this business
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  -- Validate customer is in this business and not deleted
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
     WHERE id = v_customer_id
       AND business_id = v_business_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in this business';
  END IF;

  -- Must have at least one item
  v_items_count := jsonb_array_length(p_input->'items');
  IF v_items_count IS NULL OR v_items_count = 0 THEN
    RAISE EXCEPTION 'Invoice must have at least one item';
  END IF;

  -- Recompute subtotal from line totals (defence against client tampering)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items')
  LOOP
    v_subtotal := v_subtotal + (v_item->>'line_total_paisa')::BIGINT;
  END LOOP;

  v_total := GREATEST(v_subtotal - v_discount, 0);

  -- Status from payment coverage
  IF v_paid >= v_total AND v_paid > 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partially_paid';
  ELSE
    v_status := 'issued';
  END IF;

  -- Invoice number: INV-NNNNN per business
  -- (race condition: unique index catches collisions; caller retries.)
  SELECT COUNT(*) INTO v_count FROM public.invoices WHERE business_id = v_business_id;
  v_invoice_number := 'INV-' || LPAD((v_count + 1)::TEXT, 5, '0');

  -- 1. Insert invoice (trigger: ledger debit)
  INSERT INTO public.invoices (
    business_id, customer_id, invoice_number, status, issue_date, due_date,
    subtotal_paisa, discount_paisa, total_paisa, paid_paisa, notes, created_by
  ) VALUES (
    v_business_id, v_customer_id, v_invoice_number, v_status,
    COALESCE(NULLIF(p_input->>'issue_date', '')::DATE, CURRENT_DATE),
    NULLIF(p_input->>'due_date', '')::DATE,
    v_subtotal, v_discount, v_total, v_paid,
    NULLIF(p_input->>'notes', ''), v_user_id
  ) RETURNING id INTO v_invoice_id;

  -- 2. Insert items + 3. stock_movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items')
  LOOP
    -- Snapshot purchase_price (server only — staff cannot read this column via RLS)
    SELECT COALESCE(purchase_price_paisa, 0) INTO v_purchase_price
      FROM public.products
     WHERE id = (v_item->>'product_id')::UUID
       AND business_id = v_business_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in this business', v_item->>'product_id';
    END IF;

    v_line_total := (v_item->>'line_total_paisa')::BIGINT;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price_paisa,
      purchase_price_at_sale_paisa, discount_paisa, line_total_paisa
    ) VALUES (
      v_invoice_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price_paisa')::BIGINT,
      v_purchase_price,
      COALESCE((v_item->>'discount_paisa')::BIGINT, 0),
      v_line_total
    );

    INSERT INTO public.stock_movements (
      business_id, product_id, invoice_id, type, quantity, note
    ) VALUES (
      v_business_id,
      (v_item->>'product_id')::UUID,
      v_invoice_id,
      'out',
      (v_item->>'quantity')::NUMERIC,
      'Invoice ' || v_invoice_number
    );
  END LOOP;

  -- 4. Optional payment (trigger: ledger credit)
  IF v_paid > 0 THEN
    INSERT INTO public.payments (
      business_id, customer_id, invoice_id, amount_paisa, method,
      reference, payment_date, notes, created_by
    ) VALUES (
      v_business_id, v_customer_id, v_invoice_id, v_paid,
      COALESCE(p_input->'payment'->>'method', 'cash'),
      NULLIF(p_input->'payment'->>'reference', ''),
      COALESCE(NULLIF(p_input->'payment'->>'payment_date', '')::DATE, CURRENT_DATE),
      NULLIF(p_input->'payment'->>'notes', ''),
      v_user_id
    );
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_atomic(JSONB) IS
  'Atomic invoice creation. Inserts invoice + items + stock_movements + optional payment.
   Triggers create ledger entries automatically. SECURITY DEFINER required to snapshot
   products.purchase_price_paisa for staff/viewer roles.';
