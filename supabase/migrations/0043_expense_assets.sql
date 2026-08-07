-- ═══════════════════════════════════════════════════════════════
-- Smart expense categorization: assets + sub-types
--
--   expense_assets      — trackable things that cost money repeatedly
--                         (Car LHR-1234, Shop 1 Rajana, …)
--   expense_sub_types   — what KIND of expense within a category
--                         (Petrol, Oil Change, Monthly Rent, …)
--   expenses            — gains nullable asset_id / sub_type_id plus
--                         denormalised asset_name / sub_type_name
--   expense_asset_summary_view — per (asset, sub-type, month) rollup that
--                         powers every report with plain WHERE filters
--
-- BACKWARD COMPATIBILITY: every new expenses column is nullable; existing
-- rows keep NULL and behave exactly as before. Categories are unchanged —
-- assets/sub-types add depth UNDER them.
--
-- CATEGORY EQUIVALENCE: Transport and Maintenance are one world for a
-- vehicle — a car's petrol (Transport) and its oil change (Maintenance)
-- must both attach to the same asset. expense_category_group() encodes
-- that pairing; the trigger uses it, and the app mirrors it client-side.
-- In the database each expense keeps its original category.
--
-- Down:
--   DROP VIEW IF EXISTS public.expense_asset_summary_view;
--   DROP TRIGGER IF EXISTS trg_expenses_denormalize ON public.expenses;
--   DROP FUNCTION IF EXISTS public.fn_expenses_denormalize();
--   DROP FUNCTION IF EXISTS public.expense_category_group(TEXT);
--   ALTER TABLE public.expenses
--     DROP COLUMN IF EXISTS asset_id,
--     DROP COLUMN IF EXISTS sub_type_id,
--     DROP COLUMN IF EXISTS asset_name,
--     DROP COLUMN IF EXISTS sub_type_name;
--   DROP TABLE IF EXISTS public.expense_sub_types;
--   DROP TABLE IF EXISTS public.expense_assets;
-- ═══════════════════════════════════════════════════════════════

-- The eight fixed categories (CLAUDE.md: do not change). Kept in one place
-- as a CHECK expression so both new tables agree with the app enum.
--   Rent, Utilities, Salary, Transport, Food, Office Supplies, Maintenance, Other

CREATE TABLE public.expense_assets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  category    TEXT        NOT NULL CHECK (category IN
                ('Rent','Utilities','Salary','Transport','Food','Office Supplies','Maintenance','Other')),
  name        TEXT        NOT NULL,
  asset_type  TEXT,       -- 'car' | 'bike' | 'truck' | 'rickshaw' | 'shop' | 'warehouse' | 'office' | free
  details     JSONB       NOT NULL DEFAULT '{}',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER trg_expense_assets_updated_at
  BEFORE UPDATE ON public.expense_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Case-insensitive: "car lhr-1234" typed twice is the duplicate this stops.
CREATE UNIQUE INDEX idx_expense_assets_business_category_name
  ON public.expense_assets (business_id, category, LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_assets_business_category
  ON public.expense_assets (business_id, category);

CREATE TABLE public.expense_sub_types (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  category    TEXT        NOT NULL CHECK (category IN
                ('Rent','Utilities','Salary','Transport','Food','Office Supplies','Maintenance','Other')),
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_expense_sub_types_business_category_name
  ON public.expense_sub_types (business_id, category, LOWER(name)) WHERE deleted_at IS NULL;
CREATE INDEX idx_expense_sub_types_business_category
  ON public.expense_sub_types (business_id, category, sort_order);

-- ─────────────────────────────────────────────
-- expenses: new nullable columns
-- ─────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN asset_id      UUID REFERENCES public.expense_assets(id)    ON DELETE SET NULL,
  ADD COLUMN sub_type_id   UUID REFERENCES public.expense_sub_types(id) ON DELETE SET NULL,
  ADD COLUMN asset_name    TEXT,
  ADD COLUMN sub_type_name TEXT;

CREATE INDEX idx_expenses_asset_id    ON public.expenses (asset_id)    WHERE asset_id IS NOT NULL;
CREATE INDEX idx_expenses_sub_type_id ON public.expenses (sub_type_id) WHERE sub_type_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- Category equivalence + denormalisation trigger
--
-- The trigger (not just the server action) fills asset_name/sub_type_name
-- and enforces "a car cannot be attached to a Rent expense" — so the
-- guarantee holds no matter which code path inserts the row.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expense_category_group(p_category TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_category IN ('Transport', 'Maintenance') THEN ARRAY['Transport', 'Maintenance']
    ELSE ARRAY[p_category]
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_expenses_denormalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_name     TEXT;
  v_category TEXT;
BEGIN
  IF NEW.asset_id IS NOT NULL THEN
    SELECT ea.name, ea.category INTO v_name, v_category
      FROM public.expense_assets ea
     WHERE ea.id = NEW.asset_id
       AND ea.business_id = NEW.business_id
       AND ea.deleted_at IS NULL;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Asset not found in this business';
    END IF;
    IF NOT (NEW.category = ANY (public.expense_category_group(v_category))) THEN
      RAISE EXCEPTION 'Asset belongs to category "%" — cannot attach it to a "%" expense',
        v_category, NEW.category;
    END IF;
    NEW.asset_name := v_name;
  ELSE
    NEW.asset_name := NULL;
  END IF;

  IF NEW.sub_type_id IS NOT NULL THEN
    SELECT est.name, est.category INTO v_name, v_category
      FROM public.expense_sub_types est
     WHERE est.id = NEW.sub_type_id
       AND est.business_id = NEW.business_id
       AND est.deleted_at IS NULL;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Expense type not found in this business';
    END IF;
    IF NOT (NEW.category = ANY (public.expense_category_group(v_category))) THEN
      RAISE EXCEPTION 'Expense type belongs to category "%" — cannot use it on a "%" expense',
        v_category, NEW.category;
    END IF;
    NEW.sub_type_name := v_name;
  ELSE
    NEW.sub_type_name := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_denormalize
  BEFORE INSERT OR UPDATE OF asset_id, sub_type_id, category ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_expenses_denormalize();

-- ─────────────────────────────────────────────
-- RLS
-- Read: any business member (staff/viewer see names — asset names are not
-- price data). Write: admin/accountant. Delete: nobody (soft delete).
-- ─────────────────────────────────────────────
ALTER TABLE public.expense_assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_sub_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_assets_select ON public.expense_assets
  FOR SELECT USING (public.user_has_business(business_id) AND deleted_at IS NULL);
CREATE POLICY expense_assets_insert ON public.expense_assets
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );
CREATE POLICY expense_assets_update ON public.expense_assets
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );
CREATE POLICY expense_assets_delete ON public.expense_assets
  FOR DELETE USING (false);

CREATE POLICY expense_sub_types_select ON public.expense_sub_types
  FOR SELECT USING (public.user_has_business(business_id) AND deleted_at IS NULL);
CREATE POLICY expense_sub_types_insert ON public.expense_sub_types
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );
CREATE POLICY expense_sub_types_update ON public.expense_sub_types
  FOR UPDATE USING (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'accountant')
  );
CREATE POLICY expense_sub_types_delete ON public.expense_sub_types
  FOR DELETE USING (false);

-- ─────────────────────────────────────────────
-- Seed default sub-types for every EXISTING business.
-- Vehicle types are seeded under Transport only: the category-group rule
-- exposes them for Maintenance expenses too, so seeding them twice would
-- just create duplicate dropdown entries.
-- (A business created later starts empty and the owner adds types in the
--  settings page — acceptable for a single-owner system.)
-- ─────────────────────────────────────────────
INSERT INTO public.expense_sub_types (business_id, category, name, sort_order)
SELECT b.id, d.category, d.name, d.sort_order
FROM public.businesses b
CROSS JOIN (VALUES
  ('Transport',       'Petrol',              1),
  ('Transport',       'Diesel',              2),
  ('Transport',       'CNG',                 3),
  ('Transport',       'Oil Change',          4),
  ('Transport',       'Tyre Change',         5),
  ('Transport',       'Engine Repair',       6),
  ('Transport',       'Body Work',           7),
  ('Transport',       'Registration',        8),
  ('Transport',       'Insurance',           9),
  ('Transport',       'Washing',            10),
  ('Rent',            'Monthly Rent',        1),
  ('Rent',            'Advance',             2),
  ('Rent',            'Renovation',          3),
  ('Rent',            'Repair',              4),
  ('Utilities',       'Electricity',         1),
  ('Utilities',       'Gas',                 2),
  ('Utilities',       'Water',               3),
  ('Utilities',       'Internet',            4),
  ('Utilities',       'Phone',               5),
  ('Salary',          'Monthly Salary',      1),
  ('Salary',          'Bonus',               2),
  ('Salary',          'Overtime',            3),
  ('Salary',          'Advance',             4),
  ('Food',            'Meals',               1),
  ('Food',            'Tea/Drinks',          2),
  ('Food',            'Guest Entertainment', 3),
  ('Office Supplies', 'Stationery',          1),
  ('Office Supplies', 'Printing',            2),
  ('Office Supplies', 'Furniture',           3)
) AS d(category, name, sort_order)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- expense_asset_summary_view
--
-- One row per (business, type, category, asset, sub-type, month). Reports
-- filter this with plain WHEREs for any category/asset/sub-type/time
-- combination. Assets and sub-types are joined for live names, falling back
-- to the denormalised snapshot if the master row was soft-deleted.
--
-- Owner view (like the others): business isolation via user_has_business();
-- expense amounts are already admin/accountant-gated by page access.
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.expense_asset_summary_view AS
SELECT
  e.business_id,
  e.type,
  e.category,
  e.asset_id,
  COALESCE(ea.name, e.asset_name)      AS asset_name,
  ea.asset_type,
  e.sub_type_id,
  COALESCE(est.name, e.sub_type_name)  AS sub_type_name,
  DATE_TRUNC('month', e.expense_date)::DATE AS expense_month,
  COUNT(*)::INTEGER                    AS transaction_count,
  SUM(e.amount_paisa)::BIGINT          AS total_paisa
FROM public.expenses e
LEFT JOIN public.expense_assets    ea  ON ea.id  = e.asset_id
LEFT JOIN public.expense_sub_types est ON est.id = e.sub_type_id
WHERE e.deleted_at IS NULL
  AND public.user_has_business(e.business_id)
GROUP BY
  e.business_id, e.type, e.category,
  e.asset_id, COALESCE(ea.name, e.asset_name), ea.asset_type,
  e.sub_type_id, COALESCE(est.name, e.sub_type_name),
  DATE_TRUNC('month', e.expense_date);

GRANT SELECT ON public.expense_asset_summary_view TO authenticated;

COMMENT ON TABLE public.expense_assets IS
  'Trackable expense targets (vehicles, shops, …). Unique per (business, category, name).
   Transport and Maintenance are treated as one category group for matching.';
COMMENT ON TABLE public.expense_sub_types IS
  'Kinds of expense within a category (Petrol, Monthly Rent, …). Vehicle types live
   under Transport; the category group exposes them to Maintenance expenses too.';
COMMENT ON FUNCTION public.expense_category_group(TEXT) IS
  'Categories that share assets/sub-types: Transport+Maintenance pair, everything else alone.';
COMMENT ON VIEW public.expense_asset_summary_view IS
  'Per (type, category, asset, sub-type, month) expense rollup powering the reports.';
