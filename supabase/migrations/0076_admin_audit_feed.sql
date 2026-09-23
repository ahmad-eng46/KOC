-- ═══════════════════════════════════════════════════════════════
-- Part C: one feed an admin can ask "what did I change?"
--
-- WHY NOT A NEW TABLE
--   Three surfaces already record this, and the brief's own warning is against
--   a fourth:
--
--     audit_log                      written by database triggers on the money
--                                    tables. Already append-only: its INSERT,
--                                    UPDATE and DELETE policies are all
--                                    USING (false) / WITH CHECK (false), so
--                                    nobody — admin included — can write or
--                                    alter a row through the API.
--     activity_log                   written by logActivity() as each action
--                                    succeeds. Carries the before/after values
--                                    in metadata.
--     staff_activity_notifications   0059's admin feed over activity_log, with
--                                    notification_reads as a per-admin
--                                    high-water mark.
--
--   0059 deliberately shows only what OTHERS did — it filters u.role <> 'admin'
--   — because it answers "what did staff do?". Part C asks a different
--   question: "what happened here, including by me?". So this is a second view
--   over the same rows with a different filter, not a second store. Nothing is
--   recorded twice.
--
-- WHAT IT COVERS
--   balance.adjusted      admin balance changes                      (Part B)
--   stock.adjusted        stock corrections, opening stock, purchase
--                         deletions                                  (Part A)
--   stock.purchased       staff adding stock                         (Part A)
--   product.*             catalogue changes
--   purchase.rate_corrected  a corrected purchase rate               (0069)
--   invoice.rate_overridden  a staff rate override                   (0068)
--   change.* / deletion.*    requests and the decisions on them      (Part A)
--
-- APPEND-ONLY
--   activity_log's own policies are the guarantee. This view adds no write
--   path, and a view over a table cannot grant one.
--
-- UNREAD
--   notification_reads already holds a per-admin, per-business high-water
--   mark. It is reused rather than duplicated: an admin's unread count is the
--   rows in this feed newer than their marker, excluding their own actions —
--   nobody needs telling about what they just did.
--
-- Down:
--   DROP VIEW IF EXISTS public.admin_audit_feed;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.admin_audit_feed;

CREATE VIEW public.admin_audit_feed AS
SELECT
  al.id,
  al.business_id,
  al.user_id                        AS actor_id,
  u.full_name                       AS actor_name,
  u.role                            AS actor_role,
  al.action,
  al.entity_type,
  al.entity_id,
  al.description,
  al.metadata,
  al.created_at,

  -- Before / after, lifted out of metadata so a caller can show the movement
  -- without knowing each action's shape. NULL where an action has no money
  -- value to report, which is most of them.
  COALESCE(
    (al.metadata ->> 'old_value_paisa')::BIGINT,
    (al.metadata ->> 'old_unit_price_paisa')::BIGINT,
    (al.metadata ->> 'suggested_rate_paisa')::BIGINT
  )                                 AS old_value_paisa,
  COALESCE(
    (al.metadata ->> 'new_value_paisa')::BIGINT,
    (al.metadata ->> 'new_unit_price_paisa')::BIGINT,
    (al.metadata ->> 'entered_rate_paisa')::BIGINT
  )                                 AS new_value_paisa,
  COALESCE(
    (al.metadata ->> 'difference_paisa')::BIGINT,
    (al.metadata ->> 'new_value_paisa')::BIGINT - (al.metadata ->> 'old_value_paisa')::BIGINT
  )                                 AS difference_paisa,
  al.metadata ->> 'reason'          AS reason,

  -- True while this row is newer than the reading admin's marker and was not
  -- their own doing.
  (
    al.user_id <> auth.uid()
    AND al.created_at > COALESCE(
      (SELECT nr.last_seen_at
         FROM public.notification_reads nr
        WHERE nr.user_id = auth.uid()
          AND nr.business_id = al.business_id),
      '-infinity'::timestamptz)
  )                                 AS is_unread

FROM public.activity_log al
LEFT JOIN public.users u ON u.id = al.user_id
WHERE public.user_has_business(al.business_id)
  -- Admin only. The feed names who did what and carries before/after money;
  -- it is an oversight tool, not a shared timeline.
  AND public.user_role() = 'admin'
  AND al.action IN (
    'balance.adjusted',
    'stock.adjusted',
    'stock.purchased',
    'purchase.rate_corrected',
    'invoice.rate_overridden',
    'product.created',
    'product.updated',
    'invoice.created',
    'payment.recorded',
    'return.processed',
    'change.requested',
    'change.approved',
    'change.rejected',
    'deletion.requested',
    'deletion.approved',
    'deletion.rejected',
    'deletion.cancelled'
  );

GRANT SELECT ON public.admin_audit_feed TO authenticated;

COMMENT ON VIEW public.admin_audit_feed IS
  'Everything an admin may need to look back on, their own actions included —
   which is what separates it from staff_activity_notifications (0059), whose
   whole purpose is to show what OTHER people did. One store, two questions.
   Append-only: activity_log refuses writes through the API.';
