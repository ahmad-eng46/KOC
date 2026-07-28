-- ─────────────────────────────────────────────
-- Bring negative stock balances back to zero.
--
-- Before 0037 added the stock guard, invoices could be raised for more than
-- was on hand. Two products ended up negative:
--   OIL-KER  Kerosene Oil            -7128
--   OIL-LDO  Light Diesel Oil (LDO)  -2131
--
-- 0037 rejects any sale that would take a product below zero, which also means
-- a product already below zero cannot be sold at all. This migration inserts a
-- single 'adjustment' movement per affected product to lift the balance to
-- exactly zero, so trading can resume.
--
-- These adjustments assert an opening balance of zero, not a physical count.
-- If a stock take later shows real quantities, enter them as a normal 'in'
-- movement on top.
--
-- Written as a computed correction rather than hardcoded numbers so it lands
-- on zero regardless of movements recorded between authoring and deployment.
--
-- Reversal: DELETE FROM public.stock_movements
--            WHERE note = 'System correction: negative stock reset to zero (0038)';
-- ─────────────────────────────────────────────

INSERT INTO public.stock_movements (business_id, product_id, type, quantity, note)
SELECT
  s.business_id,
  s.product_id,
  'adjustment',
  -s.on_hand,
  'System correction: negative stock reset to zero (0038)'
FROM (
  SELECT
    sm.business_id,
    sm.product_id,
    SUM(
      CASE
        WHEN sm.type IN ('in', 'return', 'adjustment') THEN  sm.quantity
        WHEN sm.type = 'out'                           THEN -sm.quantity
      END
    ) AS on_hand
  FROM public.stock_movements sm
  GROUP BY sm.business_id, sm.product_id
) s
WHERE s.on_hand < 0;
