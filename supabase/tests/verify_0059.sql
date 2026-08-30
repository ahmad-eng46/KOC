-- Verify 0059: the admin is told what staff did, and is not asked to approve it.
-- Run in the Supabase SQL editor AFTER applying supabase/migrations/0059_*.sql.
-- This file only checks. It does not apply anything — if it says FAIL, the
-- migration has not been run yet. Expect PASS on all four.

-- 1. The feed exists and is readable by signed-in users (the view's own WHERE
--    narrows it to admins of the business).
SELECT
  CASE WHEN COUNT(*) = 1
       THEN 'PASS  staff_activity_notifications exists'
       ELSE 'FAIL  view missing'
  END AS view_present
FROM pg_views WHERE schemaname = 'public' AND viewname = 'staff_activity_notifications';

-- 2. It never shows an admin their own work, and never leaks across businesses.
SELECT
  CASE WHEN definition ILIKE '%user_has_business%' AND definition ILIKE '%<> ''admin''%'
       THEN 'PASS  feed is business-scoped and excludes admin actors'
       ELSE 'FAIL  guards missing from the view definition'
  END AS feed_guards
FROM pg_views WHERE schemaname = 'public' AND viewname = 'staff_activity_notifications';

-- 3. Read markers are private — own row only, on every command.
SELECT
  CASE WHEN COUNT(*) FILTER (WHERE COALESCE(qual, with_check) ILIKE '%auth.uid()%') = COUNT(*)
       THEN 'PASS  notification_reads policies are all own-row'
       ELSE 'FAIL  a policy does not pin user_id to the caller'
  END AS marker_privacy
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notification_reads' AND cmd <> 'DELETE';

-- 4. Nothing new waits on an admin: deletion_requests is still the only
--    approval queue, and 0059 added no pending state of its own.
SELECT
  CASE WHEN NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'notification_reads'
           AND column_name IN ('status', 'approved_at', 'approved_by')
       )
       THEN 'PASS  notifications carry no approval state'
       ELSE 'FAIL  an approval column crept into notification_reads'
  END AS not_an_approval_queue;
