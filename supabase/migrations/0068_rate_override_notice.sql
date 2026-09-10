-- ═══════════════════════════════════════════════════════════════
-- Tell the admin when staff sold at a rate other than the suggested one
--
-- 0059 already built the mechanism: staff_activity_notifications is an
-- admin-only view over activity_log, and notification_reads marks how far each
-- admin has read. This adds one action to that view's whitelist. No new table,
-- no second feed, no approval step — the invoice is already saved by the time
-- anyone reads this.
--
-- 'invoice.rate_overridden' is written by createInvoice() when a line's rate
-- differs from what the form suggested by more than a set tolerance. The
-- metadata carries the suggested rate, the entered rate, the difference and the
-- percentage, plus a below_cost flag; the numbers are computed on the server
-- because staff cannot read a cost price to compare against (iron rule #3).
--
-- Admin overrides are not recorded, and that needs no code: the view already
-- filters `u.role <> 'admin'`.
--
-- Down:
--   DROP VIEW public.staff_activity_notifications;  -- then recreate from 0059
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.staff_activity_notifications;

CREATE VIEW public.staff_activity_notifications AS
SELECT
  al.id,
  al.business_id,
  al.user_id      AS actor_id,
  u.full_name     AS actor_name,
  u.role          AS actor_role,
  al.action,
  al.entity_type,
  al.entity_id,
  al.description,
  al.metadata,
  al.created_at
FROM public.activity_log al
JOIN public.users u ON u.id = al.user_id
WHERE public.user_has_business(al.business_id)
  AND public.user_role() = 'admin'
  AND u.role <> 'admin'
  AND al.action IN (
    'product.created',
    'product.updated',
    'invoice.created',
    'payment.recorded',
    'stock.purchased',
    'return.processed',
    -- New in 0068. A notice, not a gate: the sale already happened.
    'invoice.rate_overridden'
  );

GRANT SELECT ON public.staff_activity_notifications TO authenticated;

COMMENT ON VIEW public.staff_activity_notifications IS
  'Admin-only feed of what non-admins did. A notice, not an approval queue —
   the action has already happened by the time it appears here.';
