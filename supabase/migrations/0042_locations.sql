-- ═══════════════════════════════════════════════════════════════
-- Locations (city / delivery-route areas) + per-customer balances
--
--   locations              — city master (Rajana, Toba, Kamalia, …)
--   customers.location_id  — nullable; existing customers stay NULL
--   customer_balances_view — SERVER-SIDE per-customer balance. Pays down the
--                            tech debt noted in MEMORY.md: the same
--                            opening + SUM(debit − credit) that
--                            lib/queries/customers-balance.ts computes
--                            client-side, now done once in SQL.
--   location_summary_view  — one row per location: customer count, dues
--                            count, outstanding, sales
--   assign_customer_location()  — single assign, staff allowed
--   assign_customers_location() — bulk assign, admin/accountant only
--
-- BALANCE SEMANTICS (copied from lib/queries/reports.ts, not reinvented):
--   balance      = opening_balance_paisa + SUM(debit − credit)   (all entries)
--   total sales  = SUM(debit)  WHERE ref_type = 'invoice'
--   total paid   = SUM(credit) WHERE ref_type = 'payment'
--   last activity= MAX(entry_date)
--
-- Balances are sale-side money (what customers owe US), not purchase prices,
-- so these views are visible to every role — iron rule #3 does not apply.
-- The views bypass ledger_entries' admin/accountant-only RLS by design
-- (they are owner views, like products_for_role); business isolation is
-- enforced with user_has_business() in each WHERE.
--
-- Down:
--   DROP FUNCTION IF EXISTS public.assign_customers_location(UUID[], UUID);
--   DROP FUNCTION IF EXISTS public.assign_customer_location(UUID, UUID);
--   DROP VIEW IF EXISTS public.location_summary_view;
--   DROP VIEW IF EXISTS public.customer_balances_view;
--   ALTER TABLE public.customers DROP COLUMN IF EXISTS location_id;
--   DROP TABLE IF EXISTS public.locations;
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name        TEXT        NOT NULL,
  short_code  TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Case-insensitive uniqueness: "Rajana" and "rajana" are the same city typed
-- twice, which is exactly the duplicate this constraint exists to stop.
CREATE UNIQUE INDEX idx_locations_business_name
  ON public.locations (business_id, LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_locations_business_id ON public.locations (business_id);
CREATE INDEX idx_locations_sort        ON public.locations (business_id, sort_order, name);

-- ─────────────────────────────────────────────
-- customers.location_id — nullable, never forced
-- ─────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_business_location
  ON public.customers (business_id, location_id);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY locations_select ON public.locations
  FOR SELECT USING (
    public.user_has_business(business_id)
    AND deleted_at IS NULL
  );

CREATE POLICY locations_insert ON public.locations
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY locations_update ON public.locations
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );

CREATE POLICY locations_delete ON public.locations
  FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- customer_balances_view
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.customer_balances_view AS
SELECT
  c.id            AS customer_id,
  c.business_id,
  c.location_id,
  c.name,
  c.phone,
  c.is_defaulter,
  c.opening_balance_paisa + COALESCE(l.delta_paisa, 0) AS current_balance_paisa,
  COALESCE(l.invoiced_paisa, 0) AS total_sales_paisa,
  COALESCE(l.paid_paisa, 0)     AS total_paid_paisa,
  l.last_activity
FROM public.customers c
LEFT JOIN (
  SELECT
    le.customer_id,
    SUM(le.debit_paisa - le.credit_paisa)::BIGINT AS delta_paisa,
    SUM(le.debit_paisa)  FILTER (WHERE le.ref_type = 'invoice')::BIGINT AS invoiced_paisa,
    SUM(le.credit_paisa) FILTER (WHERE le.ref_type = 'payment')::BIGINT AS paid_paisa,
    MAX(le.entry_date) AS last_activity
  FROM public.ledger_entries le
  GROUP BY le.customer_id
) l ON l.customer_id = c.id
WHERE c.deleted_at IS NULL
  AND public.user_has_business(c.business_id);

-- ═══════════════════════════════════════════════════════════════
-- location_summary_view
--
-- total_outstanding_paisa sums only POSITIVE balances (GREATEST(balance, 0)).
-- The card exists so the owner knows what he can collect in that city; a
-- net sum would let one overpaid customer mask everyone else's dues and show
-- a green "all clear" over money still on the street.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.location_summary_view AS
SELECT
  loc.id          AS location_id,
  loc.business_id,
  loc.name        AS location_name,
  loc.short_code,
  loc.sort_order,
  loc.is_active,
  COUNT(b.customer_id)::INTEGER AS customer_count,
  COUNT(b.customer_id) FILTER (WHERE b.current_balance_paisa > 0)::INTEGER
    AS customers_with_dues,
  COALESCE(SUM(GREATEST(b.current_balance_paisa, 0)), 0)::BIGINT
    AS total_outstanding_paisa,
  COALESCE(SUM(b.total_sales_paisa), 0)::BIGINT AS total_sales_paisa,
  COALESCE(SUM(b.total_paid_paisa), 0)::BIGINT  AS total_paid_paisa
FROM public.locations loc
LEFT JOIN public.customer_balances_view b
       ON b.location_id = loc.id
WHERE loc.deleted_at IS NULL
  AND public.user_has_business(loc.business_id)
GROUP BY loc.id, loc.business_id, loc.name, loc.short_code, loc.sort_order, loc.is_active;

GRANT SELECT ON public.customer_balances_view TO authenticated;
GRANT SELECT ON public.location_summary_view  TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Assignment RPCs
--
-- customers_update RLS is admin/accountant only, but the spec wants staff to
-- assign a shop to a city. Widening customers_update would hand staff every
-- customer field; these SECURITY DEFINER functions hand them exactly one.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assign_customer_location(
  p_customer_id UUID,
  p_location_id UUID  -- NULL unassigns
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.user_role() NOT IN ('admin', 'accountant', 'staff') THEN
    RAISE EXCEPTION 'Permission denied: cannot assign locations';
  END IF;

  SELECT c.business_id INTO v_business_id
    FROM public.customers c
   WHERE c.id = p_customer_id
     AND c.deleted_at IS NULL;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.id = p_location_id
       AND l.business_id = v_business_id
       AND l.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Location not found in this business';
  END IF;

  UPDATE public.customers
     SET location_id = p_location_id
   WHERE id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_customers_location(
  p_customer_ids UUID[],
  p_location_id  UUID  -- NULL unassigns
)
RETURNS INTEGER  -- how many rows were actually updated
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id UUID;
  v_count       INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Bulk rewiring of the customer base is a setup task: admin/accountant.
  IF public.user_role() NOT IN ('admin', 'accountant') THEN
    RAISE EXCEPTION 'Permission denied: cannot bulk-assign locations';
  END IF;

  IF p_customer_ids IS NULL OR array_length(p_customer_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- All targeted customers must belong to ONE business the caller is in;
  -- a mixed-business array is always a bug or an attack.
  SELECT c.business_id INTO v_business_id
    FROM public.customers c
   WHERE c.id = ANY(p_customer_ids)
     AND c.deleted_at IS NULL
   GROUP BY c.business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching customers';
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Customers span multiple businesses';
  END IF;

  IF NOT public.user_has_business(v_business_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of this business';
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.locations l
     WHERE l.id = p_location_id
       AND l.business_id = v_business_id
       AND l.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Location not found in this business';
  END IF;

  UPDATE public.customers
     SET location_id = p_location_id
   WHERE id = ANY(p_customer_ids)
     AND business_id = v_business_id
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_customer_location(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_customers_location(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_customer_location(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_customers_location(UUID[], UUID) TO authenticated;

COMMENT ON VIEW public.customer_balances_view IS
  'Per-customer live balance: opening + SUM(debit − credit), plus invoiced/paid
   totals and last activity. Same semantics as lib/queries/reports.ts. Visible
   to all roles (sale-side money, not purchase prices).';

COMMENT ON VIEW public.location_summary_view IS
  'Per-location rollup for the Locations hub. total_outstanding_paisa sums only
   positive balances so an overpaid customer cannot mask other customers'' dues.';

COMMENT ON FUNCTION public.assign_customer_location(UUID, UUID) IS
  'Set (or NULL to clear) one customer''s location. admin/accountant/staff.
   SECURITY DEFINER so staff can set this one field despite customers_update RLS.';

COMMENT ON FUNCTION public.assign_customers_location(UUID[], UUID) IS
  'Bulk variant for initial setup. admin/accountant only. All ids must belong to
   one business the caller is a member of. Returns rows updated.';
