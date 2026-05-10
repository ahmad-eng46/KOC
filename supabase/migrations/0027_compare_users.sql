CREATE OR REPLACE FUNCTION public._compare_users()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH cols AS (
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name NOT IN ('encrypted_password', 'confirmation_token', 'recovery_token',
        'email_change_token_new', 'email_change_token_current', 'phone_change_token',
        'reauthentication_token')
  )
  SELECT jsonb_build_object(
    'seeded', (SELECT to_jsonb(u.*) - 'encrypted_password'::text - 'confirmation_token'::text
      - 'recovery_token'::text - 'email_change_token_new'::text - 'email_change_token_current'::text
      - 'phone_change_token'::text - 'reauthentication_token'::text
      FROM auth.users u WHERE email = 'admin@khaliqoil.com'),
    'working', (SELECT to_jsonb(u.*) - 'encrypted_password'::text - 'confirmation_token'::text
      - 'recovery_token'::text - 'email_change_token_new'::text - 'email_change_token_current'::text
      - 'phone_change_token'::text - 'reauthentication_token'::text
      FROM auth.users u WHERE email = 'diag@khaliqoil.com'),
    'seeded_password_hash_prefix', (SELECT substring(encrypted_password, 1, 7)
      FROM auth.users WHERE email = 'admin@khaliqoil.com'),
    'working_password_hash_prefix', (SELECT substring(encrypted_password, 1, 7)
      FROM auth.users WHERE email = 'diag@khaliqoil.com')
  );
$$;
GRANT EXECUTE ON FUNCTION public._compare_users() TO authenticated, anon;
