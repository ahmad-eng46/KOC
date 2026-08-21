-- Verify 0054 applied. Every column must say true.
SELECT
  to_regclass('public.deletion_requests') IS NOT NULL              AS table_exists,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
            AND indexname='idx_deletion_requests_no_duplicate_pending') AS one_pending_per_entity,
  EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname='deletion_requests_reason_present')      AS reason_required,
  EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname='deletion_requests_resolution_consistent') AS resolution_consistent,
  EXISTS (SELECT 1 FROM pg_trigger
            WHERE tgname='audit_deletion_requests')                AS audited,
  -- Nobody may erase a request: it is an audit record.
  (SELECT qual = 'false' FROM pg_policies
     WHERE schemaname='public' AND tablename='deletion_requests'
       AND policyname='deletion_requests_delete')                  AS no_hard_delete,
  -- An admin must never be able to file a request they would then approve.
  (SELECT with_check NOT LIKE '%''admin''%' FROM pg_policies
     WHERE schemaname='public' AND tablename='deletion_requests'
       AND policyname='deletion_requests_insert')                  AS admin_cannot_request;

-- No request may sit resolved without a resolver, or pending with one. Expect 0 rows.
SELECT id, status, resolved_by, resolved_at FROM public.deletion_requests
 WHERE (status = 'pending' AND (resolved_by IS NOT NULL OR resolved_at IS NOT NULL))
    OR (status IN ('approved','rejected') AND (resolved_by IS NULL OR resolved_at IS NULL));

-- The queue, as the admin would see it.
SELECT status, count(*) FROM public.deletion_requests GROUP BY status ORDER BY status;
