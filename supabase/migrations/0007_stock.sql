-- ─────────────────────────────────────────────
-- stock_movements — every in/out recorded here
-- ─────────────────────────────────────────────
CREATE TABLE public.stock_movements (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  product_id    UUID        NOT NULL REFERENCES public.products(id)   ON DELETE RESTRICT,
  invoice_id    UUID,                          -- SET NULL ref; FK added after invoices table exists (0008)
  return_id     UUID,                          -- SET NULL ref; FK added after returns table exists (0009)
  type          TEXT        NOT NULL CHECK (type IN ('in', 'out', 'adjustment', 'return')),
  quantity      NUMERIC(12,3) NOT NULL,        -- supports fractional units (litres, kg)
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- no updated_at: stock movements are immutable; corrections use new rows
);

CREATE INDEX idx_stock_movements_business_id ON public.stock_movements (business_id);
CREATE INDEX idx_stock_movements_product_id  ON public.stock_movements (product_id);
CREATE INDEX idx_stock_movements_invoice_id  ON public.stock_movements (invoice_id);
CREATE INDEX idx_stock_movements_created_at  ON public.stock_movements (business_id, created_at DESC);

-- ─────────────────────────────────────────────
-- current_stock VIEW — net quantity per product
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.current_stock AS
SELECT
  sm.business_id,
  sm.product_id,
  p.name          AS product_name,
  p.sku,
  p.unit,
  p.low_stock_threshold,
  SUM(
    CASE
      WHEN sm.type IN ('in', 'return')              THEN  sm.quantity
      WHEN sm.type IN ('out')                        THEN -sm.quantity
      WHEN sm.type = 'adjustment'                    THEN  sm.quantity
    END
  )               AS quantity_on_hand
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
GROUP BY sm.business_id, sm.product_id, p.name, p.sku, p.unit, p.low_stock_threshold;
