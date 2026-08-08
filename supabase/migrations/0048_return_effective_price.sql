-- ═══════════════════════════════════════════════════════════════
-- Returns refund what the customer paid, not the list price
--
-- Discounts are recorded at the INVOICE level — a flat amount off the total —
-- while invoice_items.unit_price_paisa keeps the full list price. 0045's
-- create_return_atomic took the refund straight from unit_price_paisa, so on
-- INV-00115 (1 × Air Filter at Rs. 950, Rs. 95 off) a return credited
-- Rs. 950 instead of the Rs. 855 actually paid. The owner lost the discount
-- twice: once at sale, once at refund.
--
-- invoice_item_effective_prices() spreads the invoice discount across the
-- lines in proportion to what each contributed:
--
--   share_i    = round(base_i × discount / Σ base)     (half up)
--   effective_i = base_i − share_i
--   unit_i      = round(effective_i / quantity_i)
--
-- where base_i is line_total_paisa — qty × unit price less any per-item
-- discount — so a per-item discount, which the schema allows even though the
-- invoice form does not currently set one, is already accounted for.
--
-- The last line takes whatever is left of the discount rather than its own
-- rounded share, so the shares sum to the discount exactly instead of
-- drifting a paisa per line. "Last" means last by (created_at, id).
--
-- lib/return-pricing.ts mirrors this exactly — same proportion, same half-up
-- rounding, same remainder line, same ordering — because the return form
-- shows the price before the RPC ever sees it. Change one, change the other;
-- lib/return-pricing.test.ts pins the arithmetic.
--
-- All of it is integer paisa. The proportion uses NUMERIC for the intermediate
-- product (base × discount overflows nothing here, but NUMERIC keeps the
-- rounding exact rather than at the mercy of a division's scale) and the
-- floor+remainder form rather than ROUND(), so it matches the TypeScript
-- bit for bit.
--
-- return_items.original_price_paisa now stores the EFFECTIVE price. Rows
-- written before this migration keep the list price they were created with;
-- they are history and are left alone.
--
-- Down:
--   -- restore create_return_atomic from 0045
--   DROP FUNCTION IF EXISTS public.invoice_item_effective_prices(UUID);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.invoice_item_effective_prices(p_invoice_id UUID)
RETURNS TABLE (
  invoice_item_id            UUID,
  discount_share_paisa       BIGINT,
  effective_line_total_paisa BIGINT,
  effective_unit_price_paisa BIGINT
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH lines AS (
    SELECT
      ii.id,
      ii.quantity,
      ii.line_total_paisa                                    AS raw_base,
      GREATEST(ii.line_total_paisa, 0)::NUMERIC              AS base,
      ROW_NUMBER() OVER (ORDER BY ii.created_at, ii.id)      AS rn,
      COUNT(*)     OVER ()                                   AS n,
      SUM(GREATEST(ii.line_total_paisa, 0)) OVER ()::NUMERIC AS subtotal
    FROM public.invoice_items ii
    WHERE ii.invoice_id = p_invoice_id
  ),
  capped AS (
    SELECT
      l.*,
      -- Never distribute more than the invoice is worth.
      LEAST(
        GREATEST((SELECT COALESCE(i.discount_paisa, 0) FROM public.invoices i WHERE i.id = p_invoice_id), 0)::NUMERIC,
        l.subtotal
      ) AS discount
    FROM lines l
  ),
  shares AS (
    SELECT
      c.*,
      CASE
        WHEN c.subtotal <= 0 OR c.discount <= 0 THEN 0::NUMERIC
        -- floor + half-up remainder: the integer form of round(a*b/c)
        ELSE FLOOR(c.base * c.discount / c.subtotal)
             + CASE WHEN MOD(c.base * c.discount, c.subtotal) * 2 >= c.subtotal THEN 1 ELSE 0 END
      END AS raw_share
    FROM capped c
  ),
  allocated AS (
    SELECT
      s.*,
      COALESCE(
        SUM(s.raw_share) OVER (ORDER BY s.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
        0
      ) AS prior
    FROM shares s
  )
  SELECT
    a.id,
    share.v::BIGINT,
    eff.v::BIGINT,
    CASE WHEN a.quantity > 0 THEN ROUND(eff.v / a.quantity)::BIGINT ELSE 0::BIGINT END
  FROM allocated a
  CROSS JOIN LATERAL (
    SELECT CASE WHEN a.rn = a.n THEN a.discount - a.prior ELSE a.raw_share END AS v
  ) AS share
  CROSS JOIN LATERAL (
    SELECT GREATEST(a.raw_base::NUMERIC - share.v, 0) AS v
  ) AS eff;
$$;

REVOKE ALL ON FUNCTION public.invoice_item_effective_prices(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_item_effective_prices(UUID) TO authenticated;

COMMENT ON FUNCTION public.invoice_item_effective_prices(UUID) IS
  'Per-line price after the invoice-level discount is spread across the lines in
   proportion to line_total_paisa. Mirrored by lib/return-pricing.ts. Integer
   paisa throughout; the last line by (created_at, id) absorbs the remainder.';

-- ─────────────────────────────────────────────
-- create_return_atomic — identical to 0045 except that the default refund
-- price is now the effective (post-discount) price rather than the invoice
-- line's list price.
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

    -- Price: what the customer actually paid per unit — the invoice line less
    -- its share of the invoice-level discount — unless the owner overrides it.
    SELECT e.effective_unit_price_paisa INTO v_original_price
      FROM public.invoice_item_effective_prices(v_invoice_id) e
     WHERE e.invoice_item_id = v_inv_item.id;
    v_original_price  := COALESCE(v_original_price, v_inv_item.unit_price_paisa);

    v_return_price    := COALESCE((v_item->>'return_price_paisa')::BIGINT, v_original_price);
    v_overridden      := COALESCE((v_item->>'is_price_overridden')::BOOLEAN, false);
    v_override_reason := NULLIF(v_item->>'override_reason', '');

    IF v_return_price < 0 THEN
      RAISE EXCEPTION 'Return price cannot be negative (item %)', v_inv_item.id;
    END IF;
    IF v_return_price <> v_original_price AND NOT v_overridden THEN
      RAISE EXCEPTION
        'Return price % differs from the price actually paid % — mark it as an override with a reason',
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

    v_qty := (v_item->>'quantity')::NUMERIC(12,3);

    SELECT e.effective_unit_price_paisa INTO v_original_price
      FROM public.invoice_item_effective_prices(v_invoice_id) e
     WHERE e.invoice_item_id = v_inv_item.id;
    v_original_price  := COALESCE(v_original_price, v_inv_item.unit_price_paisa);

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
  'Atomic return creation. Refund defaults to what the customer actually paid —
   the invoice line less its share of the invoice-level discount, via
   invoice_item_effective_prices(). Owner may override per item with a mandatory
   reason. Validates qty <= sold − already-returned. Inserts returns +
   return_items + stock_movements (type=return); trigger creates the ledger
   credit. Admin or accountant only.';
