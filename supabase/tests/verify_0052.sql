-- Verify 0052 applied. Every column must say true.
SELECT
  to_regclass('public.sales_analytics_view')       IS NOT NULL AS sales_view,
  to_regclass('public.product_sales_periods_view') IS NOT NULL AS periods_view,
  (SELECT has_table_privilege('authenticated','public.sales_analytics_view','SELECT'))       AS sales_view_granted,
  (SELECT has_table_privilege('authenticated','public.product_sales_periods_view','SELECT')) AS periods_view_granted,
  -- Draft and cancelled invoices must never reach the analytics.
  NOT EXISTS (SELECT 1 FROM public.sales_analytics_view WHERE invoice_status IN ('draft','cancelled'))
                                                                AS excludes_draft_and_cancelled,
  -- Every product is present, sold or not — that is what dead stock reads.
  (SELECT count(*) FROM public.product_sales_periods_view)
    = (SELECT count(*) FROM public.products WHERE deleted_at IS NULL)
                                                                AS every_product_present;

-- The invoice discount must be shared out exactly, not approximately: per
-- invoice, the line shares must add back up to the invoice's own discount.
-- Expect 0 rows.
SELECT sa.invoice_id, i.invoice_number, i.discount_paisa,
       SUM(sa.discount_share_paisa) AS shares_total
  FROM public.sales_analytics_view sa
  JOIN public.invoices i ON i.id = sa.invoice_id
 GROUP BY sa.invoice_id, i.invoice_number, i.discount_paisa
HAVING SUM(sa.discount_share_paisa) <> i.discount_paisa;

-- Net must never exceed gross, and a return must never make it negative.
-- Expect 0 rows.
SELECT line_item_id, quantity, returned_quantity, net_quantity, net_amount_paisa
  FROM public.sales_analytics_view
 WHERE net_quantity > quantity OR net_quantity < 0;
