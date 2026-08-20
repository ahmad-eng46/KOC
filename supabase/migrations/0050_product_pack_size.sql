-- ═══════════════════════════════════════════════════════════════
-- Bulk packaging: a box of 12 cans, a packet of 20 filters
--
-- The owner buys and sells by the pack but stocks and prices by the piece.
-- Everything already stored stays in the smallest unit — stock_movements,
-- invoice_items, return_items and stock_purchases quantities are units, and
-- prices are per unit — and that does not change. Only the entry and the
-- display learn about packs; the conversion happens in the app before any RPC
-- is called, so the stock guard, COGS and the P&L are untouched.
--
--   products.pack_size  units in one pack (12). 1 = no pack, the default, so
--                       every existing product behaves exactly as before.
--   products.pack_name  what the pack is called ("Box"). NULL = no pack.
--
-- The two RPCs below are replaced only to persist what the user typed, for
-- display. `quantity` stays in units in both, every total is still computed
-- server-side from units, and nothing else in either function changes. Storing
-- it means an invoice printed today still reads "2 Box (24 cans)" after the
-- owner later changes the box size to 10 — deriving it from the product's
-- current pack_size would silently rewrite history.
--
-- Down:
--   -- restore create_invoice_atomic from 0020 and
--   -- create_stock_purchase_atomic + stock_purchases_for_role from 0040
--   DROP VIEW IF EXISTS public.products_for_role;  -- then recreate from 0044
--   DROP FUNCTION IF EXISTS public.convert_to_units(NUMERIC, TEXT, INTEGER);
--   ALTER TABLE public.stock_purchases
--     DROP COLUMN IF EXISTS entered_quantity,
--     DROP COLUMN IF EXISTS entry_mode,
--     DROP COLUMN IF EXISTS pack_size_snapshot;
--   ALTER TABLE public.invoice_items
--     DROP COLUMN IF EXISTS entered_quantity,
--     DROP COLUMN IF EXISTS entry_mode,
--     DROP COLUMN IF EXISTS pack_size_snapshot;
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS pack_size, DROP COLUMN IF EXISTS pack_name;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. products
-- ─────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pack_name TEXT;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_pack_size_positive;
ALTER TABLE public.products
  ADD CONSTRAINT products_pack_size_positive CHECK (pack_size >= 1);

COMMENT ON COLUMN public.products.pack_size IS
  'Individual units in one pack (12 cans per box). 1 means the product has no pack.';
COMMENT ON COLUMN public.products.pack_name IS
  'What the bulk package is called — Box, Packet, Carton. NULL means no pack.';

-- ─────────────────────────────────────────────
-- 2. Display-only columns. Nullable: rows written before this migration were
--    all entered in units, which is exactly what NULL is read as.
-- ─────────────────────────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS entered_quantity   NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS entry_mode         TEXT,
  ADD COLUMN IF NOT EXISTS pack_size_snapshot INTEGER;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_entry_mode_valid;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_entry_mode_valid
  CHECK (entry_mode IS NULL OR entry_mode IN ('unit', 'pack'));

ALTER TABLE public.stock_purchases
  ADD COLUMN IF NOT EXISTS entered_quantity   NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS entry_mode         TEXT,
  ADD COLUMN IF NOT EXISTS pack_size_snapshot INTEGER;

ALTER TABLE public.stock_purchases
  DROP CONSTRAINT IF EXISTS stock_purchases_entry_mode_valid;
ALTER TABLE public.stock_purchases
  ADD CONSTRAINT stock_purchases_entry_mode_valid
  CHECK (entry_mode IS NULL OR entry_mode IN ('unit', 'pack'));

-- ─────────────────────────────────────────────
-- 3. convert_to_units — the same arithmetic lib/pack.ts does, available to SQL
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_to_units(
  p_quantity   NUMERIC,
  p_entry_mode TEXT,
  p_pack_size  INTEGER
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_entry_mode = 'pack' THEN p_quantity * GREATEST(COALESCE(p_pack_size, 1), 1)
    ELSE p_quantity
  END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_to_units(NUMERIC, TEXT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.convert_to_units(NUMERIC, TEXT, INTEGER) IS
  'Entered quantity to stock units. Mirrors toUnits() in lib/pack.ts.';

-- ─────────────────────────────────────────────
-- 4. products_for_role — 0044's view plus the pack columns.
--    DROP first: the view enumerates columns and the new ones sit mid-list,
--    which CREATE OR REPLACE cannot do.
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.products_for_role;

CREATE VIEW public.products_for_role AS
SELECT
  id,
  business_id,
  name,
  sku,
  unit,
  pack_size,
  pack_name,
  sale_price_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN purchase_price_paisa
    ELSE NULL
  END AS purchase_price_paisa,
  low_stock_threshold,
  brand_id,
  is_active,
  created_at,
  updated_at,
  deleted_at
FROM public.products
WHERE public.user_has_business(business_id)
  AND deleted_at IS NULL;

GRANT SELECT ON public.products_for_role TO authenticated;

-- ─────────────────────────────────────────────
-- 5. stock_purchases_for_role — 0040's view plus the entry columns and the
--    product's pack, so purchase history can print "20 Boxes".
-- ─────────────────────────────────────────────
DROP VIEW IF EXISTS public.stock_purchases_for_role;

CREATE VIEW public.stock_purchases_for_role AS
SELECT
  sp.id,
  sp.business_id,
  sp.supplier_id,
  s.name         AS supplier_name,
  sp.product_id,
  p.name         AS product_name,
  p.sku          AS product_sku,
  p.unit         AS product_unit,
  p.pack_size    AS product_pack_size,
  p.pack_name    AS product_pack_name,
  sp.quantity,
  sp.entered_quantity,
  sp.entry_mode,
  sp.pack_size_snapshot,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN sp.unit_price_paisa
    ELSE NULL
  END AS unit_price_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN sp.total_paisa
    ELSE NULL
  END AS total_paisa,
  sp.purchase_date,
  sp.notes,
  sp.created_by,
  sp.created_at
FROM public.stock_purchases sp
JOIN public.suppliers s ON s.id = sp.supplier_id
JOIN public.products  p ON p.id = sp.product_id
WHERE public.user_has_business(sp.business_id)
  AND sp.deleted_at IS NULL;

GRANT SELECT ON public.stock_purchases_for_role TO authenticated;

COMMENT ON VIEW public.stock_purchases_for_role IS
  'Staff/viewer-safe read path for stock_purchases. unit_price_paisa and total_paisa are NULL
   for those roles (iron rule #3). Supplier/product names denormalised for single-round-trip reads.';

-- ─────────────────────────────────────────────
-- 6. create_invoice_atomic — 0037's function (stock guard and row lock intact),
--    with the three display columns carried through. quantity is still units
--    and every total is still recomputed from line_total_paisa.
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

    -- Snapshot purchase_price (server only — staff cannot read this column via
    -- RLS). Locking the product row serialises concurrent invoices for the same
    -- product; without it both could read the same on-hand value and pass.
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

    -- Stock guard (0037). Movements inserted by earlier iterations of this loop
    -- are visible here, so the same product on several lines is checked against
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
      purchase_price_at_sale_paisa, discount_paisa, line_total_paisa,
      entered_quantity, entry_mode, pack_size_snapshot
    ) VALUES (
      v_invoice_id,
      v_product_id,
      v_quantity,
      (v_item->>'unit_price_paisa')::BIGINT,
      v_purchase_price,
      COALESCE((v_item->>'discount_paisa')::BIGINT, 0),
      v_line_total,
      (v_item->>'entered_quantity')::NUMERIC,
      CASE WHEN v_item->>'entry_mode' IN ('unit', 'pack') THEN v_item->>'entry_mode' END,
      (v_item->>'pack_size_snapshot')::INTEGER
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
      NULLIF(p_input->'payment'->>'notes', ''),
      v_user_id
    );
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_atomic(JSONB) TO authenticated;

-- ─────────────────────────────────────────────
-- 7. create_stock_purchase_atomic — 0040's function, same three columns.
--    quantity is still units; total_paisa is still ROUND(units × unit price).
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_stock_purchase_atomic(p_input JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id  UUID    := (p_input->>'business_id')::UUID;
  v_supplier_id  UUID    := (p_input->>'supplier_id')::UUID;
  v_product_id   UUID    := (p_input->>'product_id')::UUID;
  v_quantity     NUMERIC := (p_input->>'quantity')::NUMERIC;
  v_unit_price   BIGINT  := (p_input->>'unit_price_paisa')::BIGINT;
  v_date         DATE    := COALESCE(NULLIF(p_input->>'purchase_date', '')::DATE, CURRENT_DATE);
  v_notes        TEXT    := NULLIF(p_input->>'notes', '');
  v_entered_qty  NUMERIC := (p_input->>'entered_quantity')::NUMERIC;
  v_entry_mode   TEXT    := CASE WHEN p_input->>'entry_mode' IN ('unit', 'pack')
                                 THEN p_input->>'entry_mode' END;
  v_pack_size    INTEGER := (p_input->>'pack_size_snapshot')::INTEGER;
  v_user_id      UUID    := auth.uid();
  v_role         TEXT;
  v_total        BIGINT;
  v_purchase_id  UUID;
  v_supplier_nm  TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  v_role := public.user_role();
  IF v_role NOT IN ('admin', 'accountant', 'staff') THEN
    RAISE EXCEPTION 'Permission denied: cannot record stock purchases';
  END IF;

  IF v_quantity IS NULL OR v_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  IF v_unit_price IS NULL OR v_unit_price < 0 THEN
    RAISE EXCEPTION 'Unit price must be 0 or more';
  END IF;

  SELECT name INTO v_supplier_nm
    FROM public.suppliers
   WHERE id = v_supplier_id
     AND business_id = v_business_id
     AND deleted_at IS NULL;

  IF v_supplier_nm IS NULL THEN
    RAISE EXCEPTION 'Supplier not found in this business';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
     WHERE id = v_product_id
       AND business_id = v_business_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product not found in this business';
  END IF;

  -- Server-side truth; the client's total is never trusted.
  v_total := ROUND(v_quantity * v_unit_price)::BIGINT;

  -- 1. Purchase
  INSERT INTO public.stock_purchases (
    business_id, supplier_id, product_id, quantity,
    unit_price_paisa, total_paisa, purchase_date, notes, created_by,
    entered_quantity, entry_mode, pack_size_snapshot
  ) VALUES (
    v_business_id, v_supplier_id, v_product_id, v_quantity,
    v_unit_price, v_total, v_date, v_notes, v_user_id,
    v_entered_qty, v_entry_mode, v_pack_size
  ) RETURNING id INTO v_purchase_id;

  -- 2. Stock in, linked back to the purchase
  INSERT INTO public.stock_movements (
    business_id, product_id, stock_purchase_id, type, quantity, note
  ) VALUES (
    v_business_id, v_product_id, v_purchase_id, 'in', v_quantity,
    'Purchase from ' || v_supplier_nm
  );

  -- 3. Latest purchase price becomes the product's current cost
  UPDATE public.products
     SET purchase_price_paisa = v_unit_price
   WHERE id = v_product_id
     AND business_id = v_business_id;

  RETURN v_purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_purchase_atomic(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_stock_purchase_atomic(JSONB) TO authenticated;

COMMENT ON FUNCTION public.create_stock_purchase_atomic(JSONB) IS
  'Atomic stock purchase: stock_purchases + stock_movements(in) + products.purchase_price_paisa.
   SECURITY DEFINER so staff can record deliveries despite products being admin-only for writes.
   Recomputes total_paisa server-side from the unit quantity. Returns the new purchase id.';
