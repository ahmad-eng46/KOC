-- ─────────────────────────────────────────────
-- user_login_history(p_user_id, p_limit) — admin-callable RPC
--
-- Reads from auth.sessions, which sits in the locked-down auth schema.
-- We expose a SECURITY DEFINER function so the admin UI can list a user's
-- recent sessions without granting blanket auth-schema access. Caller must
-- be an admin (checked via public.user_role()).
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_login_history(
  p_user_id UUID,
  p_limit   INT DEFAULT 50
)
RETURNS TABLE(
  session_id   UUID,
  signed_in_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ,
  user_agent   TEXT,
  ip           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.user_role() <> 'admin' THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
    SELECT
      s.id            AS session_id,
      s.created_at    AS signed_in_at,
      s.refreshed_at,
      s.user_agent,
      s.ip::TEXT      AS ip
    FROM auth.sessions s
    WHERE s.user_id = p_user_id
    ORDER BY s.created_at DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.user_login_history(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_login_history(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.user_login_history(UUID, INT) IS
  'Recent sessions for a given user. Admin only. Reads auth.sessions via SECURITY DEFINER.';
