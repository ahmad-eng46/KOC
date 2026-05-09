-- Fix products_for_role: add business isolation + deleted_at filter
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
FROM public.products
WHERE public.user_has_business(business_id)
  AND deleted_at IS NULL;

-- Fix current_stock: add business isolation filter
CREATE OR REPLACE VIEW public.current_stock AS
SELECT
  sm.business_id,
  sm.product_id,
  p.name            AS product_name,
  p.sku,
  p.unit,
  p.low_stock_threshold,
  SUM(
    CASE
      WHEN sm.type IN ('in', 'return')  THEN  sm.quantity
      WHEN sm.type = 'out'              THEN -sm.quantity
      WHEN sm.type = 'adjustment'       THEN  sm.quantity
    END
  ) AS quantity_on_hand
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
WHERE public.user_has_business(sm.business_id)
GROUP BY sm.business_id, sm.product_id, p.name, p.sku, p.unit, p.low_stock_threshold;

GRANT SELECT ON public.products_for_role TO authenticated;
GRANT SELECT ON public.current_stock     TO authenticated;
