-- Standalone reproduction of the soft-delete bug, for a throwaway Postgres 16.
-- Not for the Supabase editor. Run:  psql -f this_file
--
-- Keeps the evidence next to the fix, because the fix is unobvious and the
-- wrong diagnosis was applied four times (0046, 0047, 0049, 0057) before this.
--
-- Expected output is recorded at each step. If step 2 ever succeeds, the
-- premise of 0060 has changed and it should be revisited.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE ROLE authenticated;
CREATE TABLE users_t (id uuid primary key, role text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT current_setting('test.uid', true)::uuid $$;
CREATE FUNCTION public.user_role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT role FROM users_t WHERE id = auth.uid() $$;
CREATE FUNCTION public.user_has_business(bid uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT true $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), public.user_role(), public.user_has_business(uuid) TO authenticated;
GRANT SELECT ON users_t TO authenticated;
INSERT INTO users_t VALUES ('11111111-1111-1111-1111-111111111111','admin');

-- brands, with 0044's policies copied verbatim.
CREATE TABLE public.brands (
  id uuid primary key, business_id uuid not null, name text not null,
  is_active boolean not null default true, deleted_at timestamptz);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.brands TO authenticated;
CREATE POLICY brands_select ON public.brands FOR SELECT USING (
  public.user_has_business(business_id) AND deleted_at IS NULL);
CREATE POLICY brands_update ON public.brands FOR UPDATE USING (
  public.user_has_business(business_id) AND public.user_role() IN ('admin','accountant'));
INSERT INTO public.brands VALUES
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','Double Horse');

SET ROLE authenticated;
SET test.uid = '11111111-1111-1111-1111-111111111111';

-- 1. Control: any other column updates fine.           EXPECT: UPDATE 1
UPDATE public.brands SET name = 'X' WHERE id = '22222222-2222-2222-2222-222222222222';

-- 2. The bug.        EXPECT: ERROR new row violates row-level security policy
UPDATE public.brands SET deleted_at = now() WHERE id = '22222222-2222-2222-2222-222222222222';

-- 3. The fix that four migrations applied. EXPECT: STILL the same ERROR.
RESET ROLE;
ALTER POLICY brands_update ON public.brands
  USING      (public.user_has_business(business_id) AND public.user_role() IN ('admin','accountant'))
  WITH CHECK (public.user_has_business(business_id) AND public.user_role() IN ('admin','accountant'));
SET ROLE authenticated;
UPDATE public.brands SET deleted_at = now() WHERE id = '22222222-2222-2222-2222-222222222222';

-- 4. Proof it is the SELECT policy: nothing here mentions deleted_at.
--    EXPECT: ERROR, identical shape — so the bug is not about deleted_at at all.
RESET ROLE;
ALTER POLICY brands_select ON public.brands USING (is_active);
SET ROLE authenticated;
UPDATE public.brands SET is_active = false WHERE id = '22222222-2222-2222-2222-222222222222';

-- 5. Remove the SELECT policy, change nothing else.    EXPECT: UPDATE 1
RESET ROLE;
DROP POLICY brands_select ON public.brands;
SET ROLE authenticated;
UPDATE public.brands SET deleted_at = now() WHERE id = '22222222-2222-2222-2222-222222222222';
