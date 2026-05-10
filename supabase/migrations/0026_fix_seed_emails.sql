-- Fix seeded user emails so fresh logins work.
--
-- Supabase has tightened email validation and now rejects the .test TLD as
-- "invalid". Seeded users on @koc.test cannot sign in (sign-in fails with
-- "Database error querying schema" — a misleading 500 from GoTrue).
--
-- Fix: rename their emails to @khaliqoil.com. UUIDs and password hashes are
-- preserved, so existing sessions, ledger entries, and user_businesses links
-- all remain intact.
--
-- Also remove the temporary test admin (admin@khaliqoil.com, created via the
-- Auth Admin API for Step 1 live testing) so the seeded admin can take that
-- email. Cascade chain:
--   auth.users → public.users (CASCADE) → user_businesses (CASCADE)
--   invoices.created_by, payments.created_by → SET NULL
-- This means INV-00101 (the test invoice) stays in place; only its
-- created_by becomes NULL.

BEGIN;

-- 1. Remove the temporary test admin to free up admin@khaliqoil.com.
DELETE FROM auth.users WHERE email = 'admin@khaliqoil.com';

-- 2. Update seeded user emails: @koc.test → @khaliqoil.com
UPDATE auth.users
   SET email = REPLACE(email, '@koc.test', '@khaliqoil.com')
 WHERE email LIKE '%@koc.test';

UPDATE public.users
   SET email = REPLACE(email, '@koc.test', '@khaliqoil.com')
 WHERE email LIKE '%@koc.test';

-- 3. Keep auth.identities.identity_data->email in sync (denormalised copy).
UPDATE auth.identities
   SET identity_data = jsonb_set(
         identity_data,
         '{email}',
         to_jsonb(REPLACE(identity_data->>'email', '@koc.test', '@khaliqoil.com'))
       )
 WHERE identity_data->>'email' LIKE '%@koc.test';

COMMIT;
