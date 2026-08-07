-- ═══════════════════════════════════════════════════════════════
-- Return price override
--
-- The refund basis was already correct — create_return_atomic (0030) prices
-- every return line from invoice_items.unit_price_paisa, the discounted
-- price the customer actually paid, and already guards over-returning
-- (qty <= sold − already-returned). This migration adds the OWNER OVERRIDE:
--
--   return_items.original_price_paisa  what the customer paid per unit
--                                      (snapshot of the invoice line price)
--   return_items.return_price_paisa    the actual refund per unit — equal to
--                                      original unless overridden
--   return_items.is_price_overridden   owner changed the price
--   return_items.override_reason       why (required when overridden)
--
-- The legacy unit_price_paisa / line_total_paisa columns stay and now hold
-- the REFUND price and refund line total, so every existing consumer
-- (returns.total_paisa, the ledger credit, the backup sheet, the invoice
-- detail list) keeps meaning "money actually credited".
--
-- Existing rows backfill original = return = unit price (no overrides
-- existed before this migration).
--
-- Stock restore stays type='return' — current_stock counts it as stock-in
-- and it is linked via stock_movements.return_id; changing it to 'in'
-- would only lose the movement's meaning.
--
-- Down:
--   (restore create_return_atomic from 0030)
--   ALTER TABLE public.return_items
--     DROP COLUMN IF EXISTS original_price_paisa,
--     DROP COLUMN IF EXISTS return_price_paisa,
--     DROP COLUMN IF EXISTS is_price_overridden,
--     DROP COLUMN IF EXISTS override_reason;
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.return_items
  ADD COLUMN original_price_paisa BIGINT,
  ADD COLUMN return_price_paisa   BIGINT,
  ADD COLUMN is_price_overridden  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN override_reason      TEXT;

UPDATE public.return_items
   SET original_price_paisa = unit_price_paisa,
       return_price_paisa   = unit_price_paisa
 WHERE original_price_paisa IS NULL;

ALTER TABLE public.return_items
  ALTER COLUMN original_price_paisa SET NOT NULL,
  ALTER COLUMN return_price_paisa   SET NOT NULL,
  ADD CONSTRAINT return_items_prices_positive
    CHECK (original_price_paisa >= 0 AND return_price_paisa >= 0),
  -- An override must explain itself; a non-override must match the original.
  ADD CONSTRAINT return_items_override_consistent
    CHECK (
      (is_price_overridden AND override_reason IS NOT NULL)
      OR (NOT is_price_overridden AND return_price_paisa = original_price_paisa)
    );

-- ─────────────────────────────────────────────
-- create_return_atomic — replaced with per-item price override support.
-- Same shape as 0030 otherwise: over-return guard, RET-NNNNN numbering,
-- ledger credit via trigger, stock_movements type='return'.
--
-- Item input now accepts (all optional, defaulting to the old behaviour):
--   return_price_paisa   refund per unit; defaults to the invoice price
--   is_price_overridden  must be true whenever return_price differs
--   override_reason      required when overridden
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
  v_original_price BIGINT;
  v_return_price   BIGINT;
  v_overridden     BOOLEAN;
  v_override_reason TEXT;
  v_line_total     BIGINT;
  v_reason         TEXT := COALESCE(NULLIF(p_input->>'reason', ''), 'Return');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT business_id, customer_id, invoice_number
    INTO v_business_id, v_customer_id, v_invoice_number
    FROM public.invoices
   WHERE id = v_invoice_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  SELECT role INTO v_user_role FROM public.users WHERE id = v_user_id;
  IF v_user_role NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Only admin or accountant can process returns';
  END IF;

  IF jsonb_array_length(p_input->'items') = 0 THEN
    RAISE EXCEPTION 'Return must include at least one item';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.returns WHERE business_id = v_business_id;
  v_return_number := 'RET-' || LPAD((v_count + 1)::TEXT, 5, '0');

  -- Validate every item and accumulate the total BEFORE writing anything.
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

    -- Price: the invoice line price (what the customer actually paid,
    -- discount included) unless the owner overrides it.
    v_original_price  := v_inv_item.unit_price_paisa;
    v_return_price    := COALESCE((v_item->>'return_price_paisa')::BIGINT, v_original_price);
    v_overridden      := COALESCE((v_item->>'is_price_overridden')::BOOLEAN, false);
    v_override_reason := NULLIF(v_item->>'override_reason', '');

    IF v_return_price < 0 THEN
      RAISE EXCEPTION 'Return price cannot be negative (item %)', v_inv_item.id;
    END IF;
    IF v_return_price <> v_original_price AND NOT v_overridden THEN
      RAISE EXCEPTION
        'Return price % differs from the invoiced price % — mark it as an override with a reason',
        v_return_price, v_original_price;
    END IF;
    IF v_overridden AND v_override_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required when overriding the return price';
    END IF;

    v_total := v_total + ROUND(v_qty * v_return_price);
  END LOOP;

  INSERT INTO public.returns (
    business_id, invoice_id, customer_id, return_number, return_date,
    total_paisa, notes, created_by
  ) VALUES (
    v_business_id, v_invoice_id, v_customer_id, v_return_number, CURRENT_DATE,
    v_total, v_reason, v_user_id
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_input->'items')
  LOOP
    SELECT id, product_id, quantity, unit_price_paisa
      INTO v_inv_item
      FROM public.invoice_items
     WHERE id = (v_item->>'invoice_item_id')::UUID;

    v_qty             := (v_item->>'quantity')::NUMERIC(12,3);
    v_original_price  := v_inv_item.unit_price_paisa;
    v_return_price    := COALESCE((v_item->>'return_price_paisa')::BIGINT, v_original_price);
    v_overridden      := COALESCE((v_item->>'is_price_overridden')::BOOLEAN, false);
    v_override_reason := NULLIF(v_item->>'override_reason', '');
    v_line_total      := ROUND(v_qty * v_return_price);

    -- unit_price_paisa/line_total_paisa keep meaning "money credited",
    -- so every pre-existing consumer stays correct.
    INSERT INTO public.return_items (
      return_id, invoice_item_id, product_id, quantity,
      unit_price_paisa, line_total_paisa,
      original_price_paisa, return_price_paisa, is_price_overridden, override_reason
    ) VALUES (
      v_return_id, v_inv_item.id, v_inv_item.product_id, v_qty,
      v_return_price, v_line_total,
      v_original_price, v_return_price, v_overridden, v_override_reason
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
  'Atomic return creation. Refund defaults to the invoiced (discounted) price per
   invoice_items; owner may override per item with a mandatory reason. Validates
   qty <= sold − already-returned. Inserts returns + return_items + stock_movements
   (type=return); trigger creates the ledger credit. Admin or accountant only.';
