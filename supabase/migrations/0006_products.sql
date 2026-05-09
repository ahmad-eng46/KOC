-- ─────────────────────────────────────────────
-- products
-- ─────────────────────────────────────────────
CREATE TABLE public.products (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name                  TEXT        NOT NULL,
  sku                   TEXT,
  unit                  TEXT        NOT NULL DEFAULT 'unit',
  sale_price_paisa      BIGINT      NOT NULL DEFAULT 0,
  purchase_price_paisa  BIGINT      NOT NULL DEFAULT 0,
  low_stock_threshold   INTEGER     NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX idx_products_sku         ON public.products (business_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_business_id        ON public.products (business_id);
CREATE INDEX idx_products_name               ON public.products (business_id, name);
CREATE INDEX idx_products_deleted_at         ON public.products (deleted_at) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- products_for_role VIEW
-- Staff and viewer see NULL for purchase_price_paisa.
-- Application code always queries this view, never the base table
-- (except admin-only server actions).
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
  is_active,
  created_at,
  updated_at,
  deleted_at
FROM public.products;
