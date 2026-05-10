-- Backfill auth.identities for seeded users.
--
-- The seed (0016_seed.sql) inserted users directly into auth.users without
-- corresponding rows in auth.identities. Modern GoTrue requires an identity
-- row per (user, provider) pair; without it, password sign-in returns
-- "Database error querying schema" and admin.listUsers fails too.
--
-- This migration is idempotent: it only inserts identities that don't already exist.

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  u.id::text,
  NOW(), NOW(), NOW()
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.identities i
     WHERE i.user_id = u.id
       AND i.provider = 'email'
  );
