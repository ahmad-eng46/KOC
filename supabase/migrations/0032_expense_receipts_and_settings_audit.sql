-- ─────────────────────────────────────────────
-- 1. Add receipt_url column to expenses
-- ─────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

COMMENT ON COLUMN public.expenses.receipt_url IS
  'Supabase Storage path within the receipts bucket. Convention: {business_id}/{expense_id_or_uuid}/{filename}.';

-- ─────────────────────────────────────────────
-- 2. Receipts storage bucket — private, RLS-scoped to business
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: receipts/{business_id}/{...rest}
-- The first folder of the object name must be a UUID belonging to a business
-- the user is a member of.

DROP POLICY IF EXISTS "receipts_select" ON storage.objects;
CREATE POLICY "receipts_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "receipts_insert" ON storage.objects;
CREATE POLICY "receipts_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
    AND public.user_role() IN ('admin', 'accountant')
  );

DROP POLICY IF EXISTS "receipts_delete" ON storage.objects;
CREATE POLICY "receipts_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.user_has_business(((storage.foldername(name))[1])::uuid)
    AND public.user_role() IN ('admin', 'accountant')
  );

-- ─────────────────────────────────────────────
-- 3. Audit trigger on app_settings
--    (other tables have these via 0013_audit.sql; settings was missed)
-- ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_app_settings ON public.app_settings;
CREATE TRIGGER audit_app_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION log_audit();
