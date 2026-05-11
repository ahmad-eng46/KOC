-- ─────────────────────────────────────────────
-- Backups Storage bucket — private, RLS-scoped to business
-- Used by: app/(app)/settings/backup (manual + scheduled).
--
-- Path convention:
--   backups/{business_id}/excel/{yyyy-mm-dd-HHMMss}-koc-backup.xlsx
--   backups/{business_id}/db-dumps/{yyyy-mm-dd}-koc.tar.gz
-- The first folder of the object name must be a UUID belonging to a
-- business the caller is a member of.
-- ─────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "backups_select" ON storage.objects;
CREATE POLICY "backups_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'backups'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
    AND public.user_role() = 'admin'
  );

DROP POLICY IF EXISTS "backups_insert" ON storage.objects;
CREATE POLICY "backups_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'backups'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
    AND public.user_role() = 'admin'
  );

DROP POLICY IF EXISTS "backups_delete" ON storage.objects;
CREATE POLICY "backups_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'backups'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
    AND public.user_role() = 'admin'
  );

-- ─────────────────────────────────────────────
-- RLS for backups table — admin only (read + insert)
-- ─────────────────────────────────────────────
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backups_table_select" ON public.backups;
CREATE POLICY "backups_table_select" ON public.backups
  FOR SELECT USING (
    public.user_role() = 'admin'
    AND (business_id IS NULL OR public.user_has_business(business_id))
  );

DROP POLICY IF EXISTS "backups_table_insert" ON public.backups;
CREATE POLICY "backups_table_insert" ON public.backups
  FOR INSERT WITH CHECK (
    public.user_role() = 'admin'
    AND (business_id IS NULL OR public.user_has_business(business_id))
  );
