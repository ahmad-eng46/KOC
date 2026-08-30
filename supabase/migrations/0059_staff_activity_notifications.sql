-- ═══════════════════════════════════════════════════════════════
-- Tell the admin what staff did — do not make them approve it first
--
-- 0058 let staff add and edit products. The owner's concern is oversight, not
-- gatekeeping: staff should not wait on anyone to add a product or raise an
-- invoice, but the admin should find out that they did.
--
-- Nothing new is recorded. activity_log already carries every one of these
-- events, written by logActivity() at the moment the action succeeds. This
-- migration adds the two things it lacks: a filter that says which of those
-- lines an admin should be told about, and a per-admin marker for how far they
-- have read.
--
-- Deliberately NOT an approval queue: the product exists the moment staff save
-- it. deletion_requests (0054) remains the only thing that waits on an admin,
-- because a deletion cannot be undone by noticing it later.
--
-- Down:
--   DROP VIEW public.staff_activity_notifications;
--   DROP TABLE public.notification_reads;
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. How far each admin has read, per business
--
--    A high-water mark rather than a row per notification per admin: there is
--    nothing to fan out, no rows to insert on every staff action, and nothing
--    to clean up. The cost is that "mark this one unread" is not expressible,
--    which nobody has asked for.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_reads (
  user_id      UUID        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  business_id  UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id)
);

-- Guarded rather than DROP ... IF EXISTS: `DROP TRIGGER IF EXISTS x ON t`
-- still raises 42P01 when t itself is missing, so the "safe" form is only safe
-- if the CREATE TABLE above actually ran. Running a fragment of this file
-- should fail loudly on the fragment, not on the cleanup line before it.
DO $$
BEGIN
  IF to_regclass('public.notification_reads') IS NULL THEN
    RAISE EXCEPTION
      'notification_reads is missing — run this migration file whole, from the top';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_reads_updated_at'
  ) THEN
    CREATE TRIGGER trg_notification_reads_updated_at
      BEFORE UPDATE ON public.notification_reads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

COMMENT ON TABLE public.notification_reads IS
  'Per-user high-water mark for the staff activity feed. Own row only.';

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_reads_select ON public.notification_reads;
DROP POLICY IF EXISTS notification_reads_insert ON public.notification_reads;
DROP POLICY IF EXISTS notification_reads_update ON public.notification_reads;
DROP POLICY IF EXISTS notification_reads_delete ON public.notification_reads;

-- Your own marker, in a business you belong to. Not even an admin has a reason
-- to read or move someone else's.
CREATE POLICY notification_reads_select ON public.notification_reads
  FOR SELECT USING (user_id = auth.uid() AND public.user_has_business(business_id));

CREATE POLICY notification_reads_insert ON public.notification_reads
  FOR INSERT WITH CHECK (user_id = auth.uid() AND public.user_has_business(business_id));

CREATE POLICY notification_reads_update ON public.notification_reads
  FOR UPDATE
  USING      (user_id = auth.uid() AND public.user_has_business(business_id))
  WITH CHECK (user_id = auth.uid() AND public.user_has_business(business_id));

CREATE POLICY notification_reads_delete ON public.notification_reads
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────
-- 2. Which activity lines an admin is told about
--
--    Two filters, and both matter:
--
--      actor role <> 'admin'  — an admin does not need telling about their own
--                               work, and with one owner on the system a feed
--                               of their own actions would be all of it.
--      action IN (...)        — the events that change stock or the books, not
--                               every login. Extend this list to widen the
--                               feed; it is the single place that decides.
--
--    Kept as a plain view with the guards written into its WHERE, matching
--    products_for_role and the rest of the schema, so the answer does not
--    depend on which client asks.
-- ─────────────────────────────────────────────
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
    'return.processed'
  );

GRANT SELECT ON public.staff_activity_notifications TO authenticated;

COMMENT ON VIEW public.staff_activity_notifications IS
  'Admin-only feed of what non-admins did. A notice, not an approval queue —
   the action has already happened by the time it appears here.';

-- ─────────────────────────────────────────────
-- 3. Confirm, rather than assume
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.notification_reads') IS NULL
     OR to_regclass('public.staff_activity_notifications') IS NULL THEN
    RAISE EXCEPTION '0059 did not finish — feed or read markers missing';
  END IF;
  RAISE NOTICE '0059 applied: admins are notified of staff activity; nothing waits on approval.';
END;
$$;
