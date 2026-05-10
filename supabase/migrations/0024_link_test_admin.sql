-- Link the live-test admin user (admin@khaliqoil.com) to all existing businesses.
-- Created via Auth Admin API (Supabase rejects .test TLD emails so the original
-- @koc.test seeded users cannot sign in). This migration is idempotent.

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@khaliqoil.com';
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'admin@khaliqoil.com not found — skipping';
    RETURN;
  END IF;

  -- Ensure role is admin (the auth trigger should have set this from user_metadata)
  UPDATE public.users SET role = 'admin' WHERE id = v_user_id AND role <> 'admin';

  -- Link to every business (admin owns all)
  INSERT INTO public.user_businesses (user_id, business_id)
  SELECT v_user_id, b.id
    FROM public.businesses b
   WHERE NOT EXISTS (
     SELECT 1 FROM public.user_businesses ub
      WHERE ub.user_id = v_user_id AND ub.business_id = b.id
   );
END $$;
