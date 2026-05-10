-- Modern GoTrue treats auth.users.email_change = NULL as a schema violation
-- and returns "Database error querying schema" when querying such rows. The
-- seed (0016) inserted users without setting this column. Working users
-- created via the Auth Admin API have email_change = '' (empty string).
-- Set it to '' for any seeded row that's NULL.
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
