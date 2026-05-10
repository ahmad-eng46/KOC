CREATE OR REPLACE FUNCTION public._debug_auth_state()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'users_count', (SELECT count(*) FROM auth.users),
    'identities_count', (SELECT count(*) FROM auth.identities),
    'admin_user', (
      SELECT to_jsonb(u) - 'encrypted_password'::text - 'confirmation_token'::text
        - 'recovery_token'::text - 'email_change_token_new'::text - 'email_change_token_current'::text
      FROM auth.users u WHERE email = 'admin@koc.test'
    ),
    'admin_identity', (
      SELECT to_jsonb(i) FROM auth.identities i
      WHERE i.user_id = (SELECT id FROM auth.users WHERE email = 'admin@koc.test')
    ),
    'auth_users_columns', (
      SELECT jsonb_agg(jsonb_build_object('column', column_name, 'nullable', is_nullable, 'default', column_default))
      FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'users'
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public._debug_auth_state() TO authenticated, anon;
