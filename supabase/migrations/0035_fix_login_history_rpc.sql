-- 0034 introduced user_login_history but the column types in the SELECT
-- don't match RETURNS TABLE for auth.sessions (the ip is inet, user_agent
-- is varchar in some Supabase versions, etc.). Re-cast everything explicitly.

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
      s.id::UUID                       AS session_id,
      s.created_at::TIMESTAMPTZ        AS signed_in_at,
      s.refreshed_at::TIMESTAMPTZ      AS refreshed_at,
      s.user_agent::TEXT               AS user_agent,
      s.ip::TEXT                       AS ip
    FROM auth.sessions s
    WHERE s.user_id = p_user_id
    ORDER BY s.created_at DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.user_login_history(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_login_history(UUID, INT) TO authenticated;
