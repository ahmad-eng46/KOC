-- ═══════════════════════════════════════════════════════════════
-- Customer categories, grown up.
--
-- The table is NOT new: public.customer_categories has existed since 0005,
-- customers.category_id since the same migration, RLS since 0017, and there is
-- live data in both. So this ALTERs rather than CREATEs — a CREATE TABLE here
-- would simply fail, and dropping to recreate would take real customers'
-- categories with it.
--
-- What 0005 left out, and this adds:
--   description   free text
--   color         hex for the badge
--   sort_order    display order the owner controls
--   is_active     hide without deleting
--   deleted_at    soft delete (iron rule #4)
--
-- Plus the two indexes the feature needs: case-insensitive uniqueness per
-- business, and the ordering index.
--
-- The SELECT policy is replaced so soft-deleted categories actually disappear.
-- Without that, deleted_at would be decoration — every read would still return
-- them.
--
-- Down:
--   DROP INDEX IF EXISTS public.idx_customer_categories_business_name;
--   DROP INDEX IF EXISTS public.idx_customer_categories_business_active;
--   DROP INDEX IF EXISTS public.idx_customers_category;
--   ALTER TABLE public.customer_categories
--     DROP COLUMN IF EXISTS description, DROP COLUMN IF EXISTS color,
--     DROP COLUMN IF EXISTS sort_order,  DROP COLUMN IF EXISTS is_active,
--     DROP COLUMN IF EXISTS deleted_at;
--   -- then restore customer_categories_select from 0017
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. The columns 0005 did not have
-- ─────────────────────────────────────────────
ALTER TABLE public.customer_categories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS color       TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- #RGB or #RRGGBB, or nothing at all. Checked here as well as in zod because a
-- colour reaching a style attribute from the database should already be safe.
ALTER TABLE public.customer_categories
  DROP CONSTRAINT IF EXISTS customer_categories_color_hex;
ALTER TABLE public.customer_categories
  ADD CONSTRAINT customer_categories_color_hex
  CHECK (color IS NULL OR color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');

COMMENT ON COLUMN public.customer_categories.color IS
  'Badge colour as #RGB or #RRGGBB. NULL means the default badge styling.';
COMMENT ON COLUMN public.customer_categories.sort_order IS
  'Display order, lowest first. Ties break on name.';

-- ─────────────────────────────────────────────
-- 2. Indexes
--    Case-insensitive: "retailer" typed twice is the duplicate this stops,
--    matching how brands and locations already guard their names.
-- ─────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_categories_business_name
  ON public.customer_categories (business_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_categories_business_active
  ON public.customer_categories (business_id, sort_order, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_category
  ON public.customers (business_id, category_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- 3. SELECT policy honours the soft delete
--    INSERT/UPDATE (admin, accountant) and DELETE (nobody) are already right
--    in 0017 and are left alone.
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS customer_categories_select ON public.customer_categories;
CREATE POLICY customer_categories_select ON public.customer_categories
  FOR SELECT USING (
    public.user_has_business(business_id) AND deleted_at IS NULL
  );

-- ─────────────────────────────────────────────
-- 4. Seed defaults — ONLY for businesses that have none
--
-- The oil business already carries Petrol Station / Transport / Retail from
-- 0016, and real customers are filed under them. Seeding the standard list
-- everywhere would sit "Retailer" beside "Retail" and "Petrol Pump" beside
-- "Petrol Station" — near-duplicates the owner would then have to clean up by
-- hand. A business that already decided its categories keeps them.
-- ─────────────────────────────────────────────
INSERT INTO public.customer_categories (business_id, name, sort_order)
SELECT b.id, d.name, d.sort_order
  FROM public.businesses b
 CROSS JOIN (VALUES
   ('Retailer',    1),
   ('Wholesaler',  2),
   ('Mechanic',    3),
   ('Workshop',    4),
   ('Petrol Pump', 5),
   ('Walk-in',     6),
   ('Other',      99)
 ) AS d(name, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.customer_categories c
    WHERE c.business_id = b.id AND c.deleted_at IS NULL
 )
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- 5. Give the categories that already exist a stable order.
--    They all sit at sort_order 0 after the ALTER, so alphabetical is the only
--    honest starting point; the owner can reorder in Settings.
-- ─────────────────────────────────────────────
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY name) AS rn
    FROM public.customer_categories
   WHERE deleted_at IS NULL AND sort_order = 0
)
UPDATE public.customer_categories c
   SET sort_order = ordered.rn
  FROM ordered
 WHERE c.id = ordered.id;
