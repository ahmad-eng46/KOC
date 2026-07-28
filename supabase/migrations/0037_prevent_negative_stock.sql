-- ─────────────────────────────────────────────
-- Prevent stock from going negative.
--
-- Before this migration create_invoice_atomic inserted an 'out' movement for
-- every line with no check against quantity on hand, so selling more than was
-- in stock silently drove the balance negative (OIL-KER reached -7128).
--
-- Two guards are added:
--   1. product_stock_on_hand() — net quantity for one product, matching the
--      current_stock view's arithmetic.
--   2. create_invoice_atomic() raises when a line would take a product below
--      zero. The check runs inside the invoice transaction and takes a row
--      lock on the product, so two concurrent invoices cannot both pass it.
--
-- Reversal: re-run 0020_invoice_rpc.sql to restore the unchecked version and
-- DROP FUNCTION public.product_stock_on_hand(UUID, UUID).
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.product_stock_on_hand(
  p_business_id UUID,
  p_product_id  UUID
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN sm.type IN ('in', 'return', 'adjustment') THEN  sm.quantity
      WHEN sm.type = 'out'                           THEN -sm.quantity
    END
  ), 0)
  FROM public.stock_movements sm
  WHERE sm.business_id = p_business_id
    AND sm.product_id  = p_product_id;
$$;

REVOKE ALL ON FUNCTION public.product_stock_on_hand(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_stock_on_hand(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.product_stock_on_hand(UUID, UUID) IS
  'Net stock on hand for one product, using the same arithmetic as the current_stock view.';


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
  v_product_id     UUID;
  v_quantity       NUMERIC;
  v_on_hand        NUMERIC;
  v_product_name   TEXT;
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
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity   := (v_item->>'quantity')::NUMERIC;

    -- Lock the product row so concurrent invoices for the same product
    -- serialise here; without this both could read the same on-hand value
    -- and each pass the check below.
    SELECT COALESCE(purchase_price_paisa, 0), name
      INTO v_purchase_price, v_product_name
      FROM public.products
     WHERE id = v_product_id
       AND business_id = v_business_id
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found in this business', v_product_id;
    END IF;

    -- Stock guard. Movements inserted by earlier iterations of this loop are
    -- visible here, so the same product on several lines is checked against
    -- the running balance rather than the opening one.
    v_on_hand := public.product_stock_on_hand(v_business_id, v_product_id);
    IF v_quantity > v_on_hand THEN
      RAISE EXCEPTION 'Not enough stock for %: % on hand, % requested',
        v_product_name, v_on_hand, v_quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_line_total := (v_item->>'line_total_paisa')::BIGINT;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price_paisa,
      purchase_price_at_sale_paisa, discount_paisa, line_total_paisa
    ) VALUES (
      v_invoice_id,
      v_product_id,
      v_quantity,
      (v_item->>'unit_price_paisa')::BIGINT,
      v_purchase_price,
      COALESCE((v_item->>'discount_paisa')::BIGINT, 0),
      v_line_total
    );

    INSERT INTO public.stock_movements (
      business_id, product_id, invoice_id, type, quantity, note
    ) VALUES (
      v_business_id,
      v_product_id,
      v_invoice_id,
      'out',
      v_quantity,
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
      NULLIF(p_input->'payment'->>'notes', ''), v_user_id
    );
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_invoice_atomic(JSONB) IS
  'Atomic invoice creation. Inserts invoice + items + stock_movements + optional payment.
   Rejects any line that would take a product below zero stock. Triggers create ledger
   entries automatically. SECURITY DEFINER required to snapshot
   products.purchase_price_paisa for staff/viewer roles.';
