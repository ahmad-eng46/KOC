-- Link the working admin (owner@khaliqoil.com, created via Auth Admin API)
-- to all businesses, and drop the temporary debug helper from 0027.
-- The seeded @koc.test → @khaliqoil.com users still cannot sign in (root
-- cause not yet identified; tracked separately). owner@khaliqoil.com is
-- the working login for browser/script use until that's resolved.

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'owner@khaliqoil.com';
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'owner@khaliqoil.com not found — skipping link';
  ELSE
    UPDATE public.users SET role = 'admin' WHERE id = v_user_id AND role <> 'admin';
    INSERT INTO public.user_businesses (user_id, business_id)
    SELECT v_user_id, b.id FROM public.businesses b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.user_businesses ub
        WHERE ub.user_id = v_user_id AND ub.business_id = b.id
     );
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._compare_users();
