CREATE OR REPLACE FUNCTION public._debug_auth_triggers()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'triggers', (
      SELECT jsonb_agg(jsonb_build_object(
        'trigger_name', tgname,
        'table', n.nspname || '.' || c.relname,
        'function', np.nspname || '.' || p.proname,
        'enabled', tgenabled,
        'when', CASE WHEN tgtype & 2 = 2 THEN 'BEFORE' ELSE 'AFTER' END,
        'event', CASE
          WHEN tgtype & 4 = 4 THEN 'INSERT'
          WHEN tgtype & 8 = 8 THEN 'DELETE'
          WHEN tgtype & 16 = 16 THEN 'UPDATE'
          ELSE 'TRUNCATE' END
      ))
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace np ON np.oid = p.pronamespace
      WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT tgisinternal
    ),
    'auth_admin_grants', (
      SELECT jsonb_agg(jsonb_build_object(
        'role', grantee,
        'priv', privilege_type,
        'table', table_schema || '.' || table_name
      ))
      FROM information_schema.role_table_grants
      WHERE table_schema = 'auth'
        AND table_name IN ('users', 'identities', 'sessions', 'refresh_tokens')
        AND grantee IN ('supabase_auth_admin', 'authenticator', 'service_role')
    ),
    'auth_users_count', (SELECT count(*) FROM auth.users),
    'auth_sessions_columns', (
      SELECT jsonb_agg(column_name) FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'sessions'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public._debug_auth_triggers() TO authenticated, anon;
