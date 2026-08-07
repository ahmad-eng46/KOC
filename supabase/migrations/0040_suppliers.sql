-- ═══════════════════════════════════════════════════════════════
-- Supplier (Vendor) Management
--
-- Adds the buy-side of the business: who we buy stock FROM, at what
-- price, when, and what we still owe them.
--
--   suppliers            — the vendor master
--   stock_purchases      — one row per "we bought N units of X from Y"
--   supplier_payments    — money paid TO a supplier
--   supplier_balance_view— purchased − paid, per supplier
--   stock_movements.stock_purchase_id — links an 'in' movement to its purchase
--   create_stock_purchase_atomic()    — purchase + movement + cost update, one txn
--
-- PRICE VISIBILITY (iron rule #3)
--   Purchase prices are the same secret as products.purchase_price_paisa.
--   Base tables stock_purchases / supplier_payments are SELECT-able by
--   admin + accountant only. Staff read stock_purchases_for_role, which
--   NULLs the money columns — exactly the products_for_role pattern.
--   Staff CAN create a purchase (they type the delivery note in hand) but
--   cannot browse historical cost afterwards.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.create_stock_purchase_atomic(JSONB);
--   DROP VIEW IF EXISTS public.supplier_balance_view;
--   DROP VIEW IF EXISTS public.stock_purchases_for_role;
--   ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS stock_purchase_id;
--   DROP TABLE IF EXISTS public.supplier_payments;
--   DROP TABLE IF EXISTS public.stock_purchases;
--   DROP TABLE IF EXISTS public.suppliers;
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- suppliers
-- ─────────────────────────────────────────────
CREATE TABLE public.suppliers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  phone       TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_suppliers_business_id ON public.suppliers (business_id);
CREATE INDEX idx_suppliers_name        ON public.suppliers (business_id, name);
CREATE INDEX idx_suppliers_deleted_at  ON public.suppliers (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- stock_purchases
--
-- quantity is NUMERIC(12,3), NOT INTEGER: stock_movements.quantity and
-- invoice_items.quantity are both NUMERIC(12,3) because this business
-- trades in litres and kilos. An INTEGER here would make it impossible to
-- record buying 20.5 litres, and would not round-trip through the
-- stock_movements row the atomic RPC writes.
--
-- total_paisa is supplied by the caller but CHECK-constrained to equal
-- quantity × unit_price_paisa, so it can never drift from its inputs no
-- matter who inserts the row.
-- ─────────────────────────────────────────────
CREATE TABLE public.stock_purchases (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID          NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  supplier_id      UUID          NOT NULL REFERENCES public.suppliers(id)  ON DELETE RESTRICT,
  product_id       UUID          NOT NULL REFERENCES public.products(id)   ON DELETE RESTRICT,
  quantity         NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_paisa BIGINT        NOT NULL CHECK (unit_price_paisa >= 0),
  total_paisa      BIGINT        NOT NULL CHECK (total_paisa >= 0),
  purchase_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  created_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT stock_purchases_total_matches_inputs
    CHECK (total_paisa = ROUND(quantity * unit_price_paisa)::BIGINT)
);

CREATE TRIGGER trg_stock_purchases_updated_at
  BEFORE UPDATE ON public.stock_purchases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_stock_purchases_business_id   ON public.stock_purchases (business_id);
CREATE INDEX idx_stock_purchases_supplier_id   ON public.stock_purchases (supplier_id, purchase_date DESC);
CREATE INDEX idx_stock_purchases_product_id    ON public.stock_purchases (product_id, purchase_date DESC);
CREATE INDEX idx_stock_purchases_purchase_date ON public.stock_purchases (business_id, purchase_date DESC);
CREATE INDEX idx_stock_purchases_deleted_at    ON public.stock_purchases (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- supplier_payments
-- ─────────────────────────────────────────────
CREATE TABLE public.supplier_payments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  supplier_id    UUID        NOT NULL REFERENCES public.suppliers(id)  ON DELETE RESTRICT,
  amount_paisa   BIGINT      NOT NULL CHECK (amount_paisa > 0),
  payment_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT        CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'online')),
  reference      TEXT,
  notes          TEXT,
  created_by     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE TRIGGER trg_supplier_payments_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_supplier_payments_business_id  ON public.supplier_payments (business_id);
CREATE INDEX idx_supplier_payments_supplier_id  ON public.supplier_payments (supplier_id, payment_date DESC);
CREATE INDEX idx_supplier_payments_deleted_at   ON public.supplier_payments (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- stock_movements.stock_purchase_id
-- Existing rows get NULL — manual stock-in stays valid and unlinked.
-- ─────────────────────────────────────────────
ALTER TABLE public.stock_movements
  ADD COLUMN stock_purchase_id UUID REFERENCES public.stock_purchases(id) ON DELETE SET NULL;

CREATE INDEX idx_stock_movements_stock_purchase_id
  ON public.stock_movements (stock_purchase_id) WHERE stock_purchase_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- Audit triggers (iron rule #5 — everything touching money)
-- ─────────────────────────────────────────────
CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_stock_purchases
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_purchases
  FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION log_audit();

-- ═══════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_purchases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

-- ── suppliers ────────────────────────────────
-- Readable by every role (a vendor name is not price data).
CREATE POLICY suppliers_select ON public.suppliers
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY suppliers_insert ON public.suppliers
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY suppliers_update ON public.suppliers
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY suppliers_delete ON public.suppliers
  FOR DELETE USING (false);

-- ── stock_purchases ──────────────────────────
-- SELECT on the base table exposes unit_price_paisa, so admin/accountant
-- only. Staff/viewer read public.stock_purchases_for_role instead.
CREATE POLICY stock_purchases_select ON public.stock_purchases
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY stock_purchases_insert ON public.stock_purchases
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant', 'staff')
  );

CREATE POLICY stock_purchases_update ON public.stock_purchases
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY stock_purchases_delete ON public.stock_purchases
  FOR DELETE USING (false);

-- ── supplier_payments ────────────────────────
-- Money out. Admin + accountant only, including SELECT.
CREATE POLICY supplier_payments_select ON public.supplier_payments
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
    AND deleted_at IS NULL
  );

CREATE POLICY supplier_payments_insert ON public.supplier_payments
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY supplier_payments_update ON public.supplier_payments
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY supplier_payments_delete ON public.supplier_payments
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- stock_purchases_for_role VIEW
--
-- The staff/viewer-safe read path. Money columns become NULL for those
-- roles (same CASE as products_for_role). Supplier and product names are
-- denormalised in because PostgREST cannot embed related resources
-- through a view — the app would otherwise need a second round-trip.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.stock_purchases_for_role AS
SELECT
  sp.id,
  sp.business_id,
  sp.supplier_id,
  s.name         AS supplier_name,
  sp.product_id,
  p.name         AS product_name,
  p.sku          AS product_sku,
  p.unit         AS product_unit,
  sp.quantity,
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

-- ═══════════════════════════════════════════════════════════════
-- supplier_balance_view
--
-- purchased − paid per supplier. Positive = we owe them; negative = we
-- overpaid.
--
-- The two sides are aggregated in separate subqueries and LEFT JOINed
-- onto suppliers. Joining the two detail tables directly would multiply
-- rows (3 purchases × 2 payments = 6 rows) and inflate both sums.
-- Driving from suppliers also means a vendor with no activity yet still
-- gets a row of zeros rather than disappearing.
--
-- Money is role-gated exactly like stock_purchases_for_role.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.supplier_balance_view AS
SELECT
  s.id          AS supplier_id,
  s.business_id,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pur.total_purchased_paisa, 0)
    ELSE NULL
  END AS total_purchased_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pay.total_paid_paisa, 0)
    ELSE NULL
  END AS total_paid_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
    THEN COALESCE(pur.total_purchased_paisa, 0) - COALESCE(pay.total_paid_paisa, 0)
    ELSE NULL
  END AS balance_due_paisa
FROM public.suppliers s
LEFT JOIN (
  SELECT supplier_id, SUM(total_paisa)::BIGINT AS total_purchased_paisa
    FROM public.stock_purchases
   WHERE deleted_at IS NULL
   GROUP BY supplier_id
) pur ON pur.supplier_id = s.id
LEFT JOIN (
  SELECT supplier_id, SUM(amount_paisa)::BIGINT AS total_paid_paisa
    FROM public.supplier_payments
   WHERE deleted_at IS NULL
   GROUP BY supplier_id
) pay ON pay.supplier_id = s.id
WHERE s.deleted_at IS NULL
  AND public.user_has_business(s.business_id);

GRANT SELECT ON public.stock_purchases_for_role TO authenticated;
GRANT SELECT ON public.supplier_balance_view    TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- create_stock_purchase_atomic(p_input JSONB) RETURNS UUID
--
-- One transaction:
--   1. stock_purchases row
--   2. stock_movements row (type='in', linked via stock_purchase_id)
--   3. products.purchase_price_paisa := this unit price (latest cost wins)
--   4. returns the new purchase id
--
-- SECURITY DEFINER because step 3 writes products, which RLS restricts to
-- admin — staff must still be able to record a delivery. Caller
-- authorisation is therefore checked explicitly below, the same way
-- create_invoice_atomic does it.
--
-- total_paisa is recomputed here from quantity × unit_price and never
-- taken from the client.
-- ═══════════════════════════════════════════════════════════════
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
    unit_price_paisa, total_paisa, purchase_date, notes, created_by
  ) VALUES (
    v_business_id, v_supplier_id, v_product_id, v_quantity,
    v_unit_price, v_total, v_date, v_notes, v_user_id
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
   Recomputes total_paisa server-side. Returns the new purchase id.';

COMMENT ON VIEW public.stock_purchases_for_role IS
  'Staff/viewer-safe read path for stock_purchases. unit_price_paisa and total_paisa are NULL
   for those roles (iron rule #3). Supplier/product names denormalised for single-round-trip reads.';

COMMENT ON VIEW public.supplier_balance_view IS
  'Per-supplier purchased − paid, in paisa. Positive = we owe the supplier. Sides aggregated
   separately to avoid row multiplication. Money NULL for staff/viewer.';
