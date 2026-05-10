-- Piece 11 — User Management

-- ─────────────────────────────────────────────
-- 1. Update handle_new_auth_user to also copy phone from raw_user_meta_data
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'viewer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────
-- 2. Populate public.users.last_login_at on every new auth.sessions row
--    Best-effort: if Supabase later locks down session-trigger insertion,
--    EXCEPTION WHEN OTHERS keeps sign-ins working.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
     SET last_login_at = NEW.created_at
   WHERE id = NEW.user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a sign-in just because we can't stamp last_login.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_auth_session_created ON auth.sessions;
CREATE TRIGGER trg_on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_session();
