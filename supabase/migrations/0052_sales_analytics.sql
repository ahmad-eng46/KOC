-- ═══════════════════════════════════════════════════════════════
-- Sales analytics: one line-level view, one per-product rollup.
--
-- Both are READ-ONLY views over data that already exists. Nothing about
-- invoices, invoice_items or products changes.
--
--   sales_analytics_view          one row per invoice line, with the invoice
--                                 discount shared out, returns netted off, and
--                                 cost/profit NULLed for staff and viewer.
--   product_sales_periods_view    one row per PRODUCT — including products that
--                                 have never sold — with 7/15/30/90/180/365-day
--                                 and all-time totals, the previous 30-day
--                                 window for trend, and stock on hand.
--
-- Four corrections to the shape this was drafted in, all forced by the schema:
--   1. invoice_items has NO deleted_at column. Lines die with their invoice,
--      which is already filtered on i.deleted_at.
--   2. The cost snapshot is purchase_price_at_sale_paisa, not
--      purchase_price_paisa. It is the price AT THE TIME OF SALE, which is the
--      only honest basis for profit — today's cost would silently rewrite the
--      margin on every historical line.
--   3. 'cancelled' is excluded as well as 'draft'. lib/queries/reports.ts does
--      exactly this, and two sales reports disagreeing is worse than either
--      choice on its own.
--   4. Returns are netted per line via return_items.invoice_item_id. Ignoring
--      them would report goods that came back as sold.
--
-- Down:
--   DROP VIEW IF EXISTS public.product_sales_periods_view;
--   DROP VIEW IF EXISTS public.sales_analytics_view;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.product_sales_periods_view;
DROP VIEW IF EXISTS public.sales_analytics_view;

-- ─────────────────────────────────────────────
-- 1. sales_analytics_view — one row per invoice line
--
-- gross → what was invoiced. net → what the business kept after returns.
-- Both are exposed; every rollup below uses net.
-- ─────────────────────────────────────────────
CREATE VIEW public.sales_analytics_view AS
WITH returned AS (
  SELECT
    ri.invoice_item_id,
    SUM(ri.quantity)                            AS returned_quantity,
    SUM(ri.quantity * ri.return_price_paisa)::BIGINT AS returned_amount_paisa
  FROM public.return_items ri
  JOIN public.returns r ON r.id = ri.return_id AND r.deleted_at IS NULL
  GROUP BY ri.invoice_item_id
)
SELECT
  ii.id                       AS line_item_id,
  i.business_id,
  i.id                        AS invoice_id,
  i.invoice_number,
  i.issue_date,
  i.status                    AS invoice_status,
  i.customer_id,
  c.name                      AS customer_name,
  c.location_id,
  loc.name                    AS location_name,
  ii.product_id,
  p.name                      AS product_name,
  p.sku                       AS product_sku,
  p.unit                      AS product_unit,
  p.pack_size,
  p.pack_name,
  p.brand_id,
  b.name                      AS brand_name,
  b.brand_type,

  ii.quantity,
  COALESCE(rt.returned_quantity, 0)                    AS returned_quantity,
  ii.quantity - COALESCE(rt.returned_quantity, 0)      AS net_quantity,

  ii.unit_price_paisa,
  ii.line_total_paisa,

  -- The invoice-level discount belongs to no single line, so it is shared out
  -- in proportion to each line's share of the subtotal. subtotal_paisa is the
  -- sum of the line totals, so the shares add back up to the discount.
  CASE
    WHEN i.subtotal_paisa > 0
      THEN ROUND((ii.line_total_paisa::NUMERIC / i.subtotal_paisa) * COALESCE(i.discount_paisa, 0))::BIGINT
    ELSE 0::BIGINT
  END AS discount_share_paisa,

  (ii.line_total_paisa - CASE
    WHEN i.subtotal_paisa > 0
      THEN ROUND((ii.line_total_paisa::NUMERIC / i.subtotal_paisa) * COALESCE(i.discount_paisa, 0))::BIGINT
    ELSE 0::BIGINT
  END)::BIGINT AS effective_amount_paisa,

  COALESCE(rt.returned_amount_paisa, 0)::BIGINT AS returned_amount_paisa,

  ((ii.line_total_paisa - CASE
    WHEN i.subtotal_paisa > 0
      THEN ROUND((ii.line_total_paisa::NUMERIC / i.subtotal_paisa) * COALESCE(i.discount_paisa, 0))::BIGINT
    ELSE 0::BIGINT
  END) - COALESCE(rt.returned_amount_paisa, 0))::BIGINT AS net_amount_paisa,

  -- Iron rule #3: cost and everything derived from it is absent, not hidden,
  -- for staff and viewer. Same user_role() test products_for_role uses.
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
      THEN COALESCE(ii.purchase_price_at_sale_paisa, p.purchase_price_paisa)
  END AS cost_price_paisa,

  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
      THEN (
        ((ii.line_total_paisa - CASE
          WHEN i.subtotal_paisa > 0
            THEN ROUND((ii.line_total_paisa::NUMERIC / i.subtotal_paisa) * COALESCE(i.discount_paisa, 0))::BIGINT
          ELSE 0::BIGINT
        END) - COALESCE(rt.returned_amount_paisa, 0))
        - ROUND(
            (ii.quantity - COALESCE(rt.returned_quantity, 0))
            * COALESCE(ii.purchase_price_at_sale_paisa, p.purchase_price_paisa, 0)
          )
      )::BIGINT
  END AS profit_paisa,

  i.issue_date                                   AS sale_date,
  DATE_TRUNC('week',  i.issue_date)::DATE        AS sale_week,
  DATE_TRUNC('month', i.issue_date)::DATE        AS sale_month
FROM public.invoice_items ii
JOIN public.invoices  i   ON i.id = ii.invoice_id AND i.deleted_at IS NULL
JOIN public.products  p   ON p.id = ii.product_id
LEFT JOIN returned    rt  ON rt.invoice_item_id = ii.id
LEFT JOIN public.brands    b   ON b.id = p.brand_id
LEFT JOIN public.customers c   ON c.id = i.customer_id
LEFT JOIN public.locations loc ON loc.id = c.location_id
WHERE i.status NOT IN ('draft', 'cancelled')
  AND public.user_has_business(i.business_id);

GRANT SELECT ON public.sales_analytics_view TO authenticated;

COMMENT ON VIEW public.sales_analytics_view IS
  'One row per invoice line for analytics. Invoice discount shared out proportionally,
   returns netted per line, draft and cancelled invoices excluded (matching the sales
   report). cost_price_paisa and profit_paisa are NULL for staff and viewer.';

-- ─────────────────────────────────────────────
-- 2. product_sales_periods_view — one row per product
--
-- Built from products LEFT JOIN the lines, not from the lines alone: a product
-- that has never sold is exactly what the dead-stock report is looking for, and
-- an inner join would hide it.
-- ─────────────────────────────────────────────
CREATE VIEW public.product_sales_periods_view AS
SELECT
  p.business_id,
  p.id                AS product_id,
  p.name              AS product_name,
  p.sku               AS product_sku,
  p.unit              AS product_unit,
  p.pack_size,
  p.pack_name,
  p.is_active,
  p.sale_price_paisa,
  p.brand_id,
  b.name              AS brand_name,
  b.brand_type,

  CASE
    WHEN public.user_role() IN ('admin', 'accountant') THEN p.purchase_price_paisa
  END AS purchase_price_paisa,

  public.product_stock_on_hand(p.business_id, p.id) AS stock_on_hand,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::NUMERIC  AS qty_7d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::BIGINT   AS sales_7d_paisa,
  COUNT(DISTINCT sa.invoice_id)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '7 days')::INTEGER      AS invoices_7d,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::NUMERIC AS qty_15d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::BIGINT  AS sales_15d_paisa,
  COUNT(DISTINCT sa.invoice_id)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '15 days')::INTEGER     AS invoices_15d,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::NUMERIC AS qty_30d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::BIGINT  AS sales_30d_paisa,
  COUNT(DISTINCT sa.invoice_id)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '30 days')::INTEGER     AS invoices_30d,

  -- The 30 days BEFORE the last 30. Trend is a fact the database can state, so
  -- it states it — leaving the UI to subtract two windows invites two answers.
  COALESCE(SUM(sa.net_quantity)     FILTER (
    WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '60 days'
      AND sa.issue_date <  CURRENT_DATE - INTERVAL '30 days'), 0)::NUMERIC AS qty_prev_30d,
  COALESCE(SUM(sa.net_amount_paisa) FILTER (
    WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '60 days'
      AND sa.issue_date <  CURRENT_DATE - INTERVAL '30 days'), 0)::BIGINT  AS sales_prev_30d_paisa,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '90 days'), 0)::NUMERIC AS qty_90d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '90 days'), 0)::BIGINT  AS sales_90d_paisa,
  COUNT(DISTINCT sa.invoice_id)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '90 days')::INTEGER     AS invoices_90d,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '180 days'), 0)::NUMERIC AS qty_180d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '180 days'), 0)::BIGINT  AS sales_180d_paisa,

  COALESCE(SUM(sa.net_quantity)      FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '365 days'), 0)::NUMERIC AS qty_365d,
  COALESCE(SUM(sa.net_amount_paisa)  FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '365 days'), 0)::BIGINT  AS sales_365d_paisa,

  COALESCE(SUM(sa.net_quantity), 0)::NUMERIC     AS qty_all,
  COALESCE(SUM(sa.net_amount_paisa), 0)::BIGINT  AS sales_all_paisa,
  COUNT(DISTINCT sa.invoice_id)::INTEGER         AS invoices_all,

  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
      THEN COALESCE(SUM(sa.profit_paisa), 0)::BIGINT
  END AS profit_all_paisa,
  CASE
    WHEN public.user_role() IN ('admin', 'accountant')
      THEN COALESCE(SUM(sa.profit_paisa) FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::BIGINT
  END AS profit_30d_paisa,

  MAX(sa.issue_date)::DATE AS last_sale_date,
  (CURRENT_DATE - MAX(sa.issue_date)::DATE)::INTEGER AS days_since_last_sale,

  ROUND(
    COALESCE(SUM(sa.net_quantity) FILTER (WHERE sa.issue_date >= CURRENT_DATE - INTERVAL '30 days'), 0) / 30.0,
    2
  )::NUMERIC AS avg_daily_qty_30d
FROM public.products p
LEFT JOIN public.brands b ON b.id = p.brand_id
LEFT JOIN public.sales_analytics_view sa ON sa.product_id = p.id
WHERE p.deleted_at IS NULL
  AND public.user_has_business(p.business_id)
GROUP BY
  p.business_id, p.id, p.name, p.sku, p.unit, p.pack_size, p.pack_name,
  p.is_active, p.sale_price_paisa, p.purchase_price_paisa,
  p.brand_id, b.name, b.brand_type;

GRANT SELECT ON public.product_sales_periods_view TO authenticated;

COMMENT ON VIEW public.product_sales_periods_view IS
  'Per-product sales rollup over fixed windows, plus the previous 30-day window for trend
   and current stock on hand. Includes products with no sales at all — that is what the
   dead-stock report reads. Cost, profit and purchase price are NULL for staff and viewer.';
