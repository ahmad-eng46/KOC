-- Verify 0055 applied. Every column must say true.
SELECT
  to_regprocedure('public.auto_resolve_deletion_requests()') IS NOT NULL AS function_exists,
  -- One trigger per soft-deletable table the approval flow can name.
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname LIKE 'trg_auto_resolve_%' AND NOT t.tgisinternal) >= 12 AS triggers_attached;

-- No request may point at an entity that is already gone while still pending.
-- Expect 0 rows (a service-role delete can legitimately leave one, so this is
-- a review list rather than a hard failure).
SELECT r.id, r.entity_type, r.entity_display_name, r.requested_at
  FROM public.deletion_requests r
  JOIN public.invoices i ON i.id = r.entity_id
 WHERE r.entity_type = 'invoice' AND r.status = 'pending' AND i.deleted_at IS NOT NULL;

-- Which tables ended up with the trigger.
SELECT c.relname AS table_name
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE t.tgname LIKE 'trg_auto_resolve_%' AND NOT t.tgisinternal
 ORDER BY c.relname;
