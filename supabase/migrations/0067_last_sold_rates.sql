-- ═══════════════════════════════════════════════════════════════
-- What did this product actually last sell for?
--
-- The invoice form pre-filled the rate from products.sale_price_paisa — the
-- master price, which is what the owner intends to charge rather than what was
-- charged. When a product is habitually discounted, every new line started
-- from a number nobody uses and had to be retyped.
--
-- Answered per customer, falling back to the last sale to anyone. A rate given
-- to one buyer is usually a rate for that buyer; letting it become everyone's
-- default is how a one-off discount quietly turns into the list price.
--
-- One call per invoice, not per line: the form passes every product id it has
-- and gets one row back for each. DISTINCT ON does the per-product pick inside
-- Postgres, so nothing unbounded crosses the wire.
--
-- Deliberately NOT security definer. invoice_items_select already lets any
-- member of the business read these rows, and invoices_select scopes them to
-- the business and hides soft-deleted invoices, so invoker rights give exactly
-- the right answer with no new surface. It reads no cost price, so it is safe
-- for staff (iron rule #3).
--
-- Down:
--   DROP FUNCTION IF EXISTS public.last_sold_rates(UUID[], UUID);
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.last_sold_rates(UUID[], UUID);

CREATE FUNCTION public.last_sold_rates(
  p_product_ids UUID[],
  p_customer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_id        UUID,
  unit_price_paisa  BIGINT,
  sold_on           DATE,
  for_this_customer BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH sold AS (
    SELECT
      ii.product_id,
      ii.unit_price_paisa,
      i.issue_date,
      i.customer_id,
      ii.created_at
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.product_id = ANY (p_product_ids)
      AND i.deleted_at IS NULL
      -- A draft was never issued and a cancelled invoice was withdrawn.
      -- Neither is evidence of a price anyone agreed to.
      AND i.status NOT IN ('draft', 'cancelled')
  ),
  -- created_at breaks the tie when a customer was billed twice in one day;
  -- issue_date alone would make the answer depend on row order.
  per_customer AS (
    SELECT DISTINCT ON (s.product_id)
      s.product_id, s.unit_price_paisa, s.issue_date
    FROM sold s
    WHERE p_customer_id IS NOT NULL
      AND s.customer_id = p_customer_id
    ORDER BY s.product_id, s.issue_date DESC, s.created_at DESC
  ),
  anyone AS (
    SELECT DISTINCT ON (s.product_id)
      s.product_id, s.unit_price_paisa, s.issue_date
    FROM sold s
    ORDER BY s.product_id, s.issue_date DESC, s.created_at DESC
  )
  SELECT
    a.product_id,
    COALESCE(pc.unit_price_paisa, a.unit_price_paisa),
    COALESCE(pc.issue_date, a.issue_date),
    pc.product_id IS NOT NULL
  FROM anyone a
  LEFT JOIN per_customer pc ON pc.product_id = a.product_id;
$$;

COMMENT ON FUNCTION public.last_sold_rates(UUID[], UUID) IS
  'Last rate each product actually sold at — to this customer if it ever was,
   otherwise to anyone. One call serves a whole invoice. Invoker rights, so
   RLS scopes it to the caller''s business.';

GRANT EXECUTE ON FUNCTION public.last_sold_rates(UUID[], UUID) TO authenticated;
