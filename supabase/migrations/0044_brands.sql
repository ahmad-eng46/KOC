-- ═══════════════════════════════════════════════════════════════
-- Product brands / suppliers
--
--   brands                 — Double Horse, Shell, "Raiz Multan", …
--   products.brand_id      — nullable; existing products stay NULL
--   products_for_role      — REPLACED to expose brand_id (it enumerates
--                            columns, so without this nobody — including
--                            admin, whose list reads the view — would see
--                            the new column)
--   brand_summary_view     — per-brand product / low / out-of-stock counts
--   assign_product_brand() / assign_products_brand() — narrow SECURITY
--                            DEFINER updates (see PERMISSIONS below)
--
-- PERMISSIONS
--   products UPDATE via RLS is admin-only, and CLAUDE.md's matrix gives
--   accountant/staff no products.update — that gate protects PRICE fields.
--   brand_id is organisational metadata (like customers.location_id), so
--   assignment goes through SECURITY DEFINER functions that can touch ONLY
--   brand_id: single assign for admin/accountant/staff, bulk for
--   admin/accountant. Same pattern as assign_customer_location() in 0042.
--
-- STOCK is computed exactly the way the rest of the app computes it: the
-- public.current_stock view over stock_movements (0007/0018). The summary
-- view joins it rather than re-deriving the SUM, so the two can never
-- disagree. "Low" mirrors StockList/ProductTable: quantity_on_hand <=
-- low_stock_threshold — with out-of-stock (<= 0) split out first so the
-- two counts don't overlap.
--
-- Down:
--   DROP VIEW IF EXISTS public.brand_summary_view;
--   DROP FUNCTION IF EXISTS public.assign_products_brand(UUID[], UUID);
--   DROP FUNCTION IF EXISTS public.assign_product_brand(UUID, UUID);
--   (recreate products_for_role from 0018 without brand_id)
--   ALTER TABLE public.products DROP COLUMN IF EXISTS brand_id;
--   DROP TABLE IF EXISTS public.brands;
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.brands (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name           TEXT        NOT NULL,
  brand_type     TEXT        NOT NULL DEFAULT 'multinational'
                             CHECK (brand_type IN ('multinational', 'local_dealer')),
  contact_person TEXT,
  phone          TEXT,
  address        TEXT,
  notes          TEXT,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX brands_business_name_unique
  ON public.brands (business_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX brands_business_active
  ON public.brands (business_id, sort_order, name)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- products.brand_id — nullable, backward compatible
-- ─────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE INDEX products_brand ON public.products (business_id, brand_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- RLS — the customers/suppliers pattern: read for any business member
-- (staff pick brands in dropdowns; names are not price data), write for
-- admin/accountant, no hard delete.
-- ─────────────────────────────────────────────
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY brands_select ON public.brands
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY brands_insert ON public.brands
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY brands_update ON public.brands
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY brands_delete ON public.brands
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────
-- products_for_role: same view as 0018 plus brand_id.
-- Purchase price stays NULL for staff/viewer — unchanged.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.products_for_role AS
SELECT
  id,
  business_id,
  name,
  sku,
  unit,
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
-- brand_summary_view
-- Counts follow the app's stock semantics via current_stock:
--   out  = quantity_on_hand <= 0
--   low  = 0 < quantity_on_hand <= low_stock_threshold
-- A product with no movements yet has no current_stock row → treated as 0
-- on hand (out of stock), same as the dashboard maths.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.brand_summary_view AS
SELECT
  b.id            AS brand_id,
  b.business_id,
  b.name          AS brand_name,
  b.brand_type,
  b.contact_person,
  b.phone,
  b.sort_order,
  b.is_active,
  COUNT(p.id)::INTEGER AS product_count,
  COUNT(p.id) FILTER (
    WHERE COALESCE(cs.quantity_on_hand, 0) <= 0
  )::INTEGER AS out_of_stock_count,
  COUNT(p.id) FILTER (
    WHERE COALESCE(cs.quantity_on_hand, 0) > 0
      AND COALESCE(cs.quantity_on_hand, 0) <= p.low_stock_threshold
  )::INTEGER AS low_stock_count,
  COALESCE(SUM(GREATEST(cs.quantity_on_hand, 0)), 0)::NUMERIC AS total_stock_units
FROM public.brands b
LEFT JOIN public.products p
       ON p.brand_id = b.id
      AND p.deleted_at IS NULL
      AND p.is_active
LEFT JOIN public.current_stock cs
       ON cs.product_id = p.id
      AND cs.business_id = p.business_id
WHERE b.deleted_at IS NULL
  AND public.user_has_business(b.business_id)
GROUP BY b.id, b.business_id, b.name, b.brand_type, b.contact_person,
         b.phone, b.sort_order, b.is_active;

GRANT SELECT ON public.brand_summary_view TO authenticated;

-- ─────────────────────────────────────────────
-- Assignment RPCs (see PERMISSIONS header)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_product_brand(
  p_product_id UUID,
  p_brand_id   UUID  -- NULL unassigns
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.user_role() NOT IN ('admin', 'accountant', 'staff') THEN
    RAISE EXCEPTION 'Permission denied: cannot assign brands';
  END IF;

  SELECT p.business_id INTO v_business_id
    FROM public.products p
   WHERE p.id = p_product_id
     AND p.deleted_at IS NULL;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  IF p_brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brands b
     WHERE b.id = p_brand_id
       AND b.business_id = v_business_id
       AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Brand not found in this business';
  END IF;

  UPDATE public.products
     SET brand_id = p_brand_id
   WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_products_brand(
  p_product_ids UUID[],
  p_brand_id    UUID  -- NULL unassigns
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
  v_count       INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Bulk rewiring of the catalog is a setup task.
  IF public.user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Permission denied: cannot bulk-assign brands';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- All targeted products must live in ONE business the caller belongs to.
  SELECT p.business_id INTO v_business_id
    FROM public.products p
   WHERE p.id = ANY(p_product_ids)
     AND p.deleted_at IS NULL
   GROUP BY p.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching products';
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Products span multiple businesses';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  IF p_brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brands b
     WHERE b.id = p_brand_id
       AND b.business_id = v_business_id
       AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Brand not found in this business';
  END IF;

  UPDATE public.products
     SET brand_id = p_brand_id
   WHERE id = ANY(p_product_ids)
     AND business_id = v_business_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_product_brand(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_products_brand(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_product_brand(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_products_brand(UUID[], UUID) TO authenticated;

COMMENT ON TABLE public.brands IS
  'Product brands and local dealers. Unique per business case-insensitively.';
COMMENT ON VIEW public.brand_summary_view IS
  'Per-brand product/low/out-of-stock counts using current_stock (the app''s
   single stock computation). out = on-hand <= 0; low = 0 < on-hand <= threshold.';
COMMENT ON FUNCTION public.assign_product_brand(UUID, UUID) IS
  'Set (or NULL) one product''s brand. admin/accountant/staff. SECURITY DEFINER
   because products UPDATE RLS is admin-only and guards price fields; this
   touches only brand_id.';
COMMENT ON FUNCTION public.assign_products_brand(UUID[], UUID) IS
  'Bulk variant for initial setup. admin/accountant. Single-business enforced.
   Returns rows updated.';
