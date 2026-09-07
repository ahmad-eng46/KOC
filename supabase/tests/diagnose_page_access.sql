-- Why is a page missing from someone's sidebar?
--
-- Replace the email on the first line and run. One row per page, with every
-- layer that gets a vote and the answer each one gives, so the offending layer
-- names itself instead of being guessed at.
--
-- Reading the result:
--   role_default  false  -> page_definitions says no for this role
--   override      false  -> an admin switched it off for this person
--   permission    false  -> the permission system denies the underlying action
--   effective     false  -> what the sidebar actually does
--
-- Read-only. Changes nothing.

WITH target AS (
  SELECT id, role, full_name FROM public.users
   WHERE email = 'staff@example.com'          -- <<< CHANGE THIS
)
SELECT
  p.key,
  p.label,
  t.role,
  CASE t.role
    WHEN 'admin'      THEN p.default_admin
    WHEN 'accountant' THEN p.default_accountant
    WHEN 'staff'      THEN p.default_staff
    WHEN 'viewer'     THEN p.default_viewer
  END                                    AS role_default,
  upa.is_allowed                         AS override,
  p.permission_key,
  upo.granted                            AS permission_override,
  p.is_lockable,
  CASE
    WHEN t.role = 'admin' THEN true
    WHEN p.is_lockable AND t.role IN ('staff','viewer') THEN false
    ELSE COALESCE(upa.is_allowed, CASE t.role
      WHEN 'accountant' THEN p.default_accountant
      WHEN 'staff'      THEN p.default_staff
      WHEN 'viewer'     THEN p.default_viewer
    END)
  END                                    AS effective
FROM target t
CROSS JOIN public.page_definitions p
LEFT JOIN public.user_page_access upa
       ON upa.user_id = t.id AND upa.page_key = p.key
LEFT JOIN public.user_permission_overrides upo
       ON upo.user_id = t.id AND upo.permission = p.permission_key
ORDER BY p.category, p.sort_order;
