-- ═══════════════════════════════════════════════════════════════
-- Stored page access stops shadowing the role defaults
--
-- THE SYMPTOM
--   A staff user has invoices.view, page_definitions says default_staff = true
--   for 'invoices', and the Invoices link is still missing from their sidebar.
--
-- THE CAUSE
--   setUserPageAccess() wrote a row into user_page_access for EVERY page on
--   the checklist, not only the ones that differed from the role default. The
--   resolver reads
--
--       override ?? roleDefault(page, role)
--
--   so any stored value — true or false — wins over the default forever. The
--   moment an admin opened a user and pressed Save, that user was frozen at
--   whatever the checklist said at that instant.
--
--   0061 then widened what staff reach by default. It reached every staff user
--   except the ones an admin had bothered to configure, which is the wrong way
--   round: the more attention a user had been given, the more stale they were.
--   0056's own note says this table "stores only departures from the role
--   defaults" — it never did.
--
-- THE FIX
--   Two halves. lib/actions/page-access.ts now deletes a row rather than
--   writing one when the tick agrees with the role default, so new saves stay
--   departures. This migration does the same to the rows already stored.
--
--   Deliberately conservative: a row is removed only where it AGREES with that
--   user's current role default. A genuine departure — an admin switching
--   something off for one person on purpose — says something the default does
--   not and is left exactly as it is.
--
-- Down:
--   None possible, and none wanted. The deleted rows carried no information:
--   each said precisely what the role default already says.
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_removed INT;
  v_kept    INT;
BEGIN
  WITH redundant AS (
    SELECT upa.business_id, upa.user_id, upa.page_key
      FROM public.user_page_access upa
      JOIN public.users u            ON u.id = upa.user_id
      JOIN public.page_definitions p ON p.key = upa.page_key
     WHERE upa.is_allowed = CASE u.role
                              WHEN 'admin'      THEN p.default_admin
                              WHEN 'accountant' THEN p.default_accountant
                              WHEN 'staff'      THEN p.default_staff
                              WHEN 'viewer'     THEN p.default_viewer
                            END
  )
  DELETE FROM public.user_page_access upa
   USING redundant r
   WHERE upa.business_id = r.business_id
     AND upa.user_id     = r.user_id
     AND upa.page_key    = r.page_key;

  GET DIAGNOSTICS v_removed = ROW_COUNT;
  SELECT COUNT(*) INTO v_kept FROM public.user_page_access;

  RAISE NOTICE
    '0063 applied: % redundant rows removed, % genuine departures kept.',
    v_removed, v_kept;
END;
$$;

-- Admins are never restricted by this table — resolvePageAccess short-circuits
-- on role before it reads an override — so rows for them are noise that makes
-- the table read as though it were doing something.
DELETE FROM public.user_page_access upa
 USING public.users u
 WHERE u.id = upa.user_id AND u.role = 'admin';
