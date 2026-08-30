-- ═══════════════════════════════════════════════════════════════
-- Staff may add and edit products; cost price and deletion stay admin-only
--
-- Every layer above the database already agrees (permissions.ts, the page
-- guard, the server action). This is the layer that has to agree too, or the
-- failure just moves from a redirect to a silent RLS rejection.
--
-- The constraint that shapes this migration:
--
--   products_select on the BASE table is admin/accountant only, on purpose —
--   the base table carries purchase_price_paisa and iron rule #3 says staff
--   must never be able to read it. Staff read through products_for_role, which
--   NULLs that column.
--
--   Postgres applies SELECT policies to the rows an UPDATE reads for its WHERE
--   clause, and to the rows an INSERT ... RETURNING hands back. So simply
--   adding 'staff' to products_update would produce an UPDATE that matches zero
--   rows and returns error = NULL: a form that says "Saved" and changed
--   nothing. Widening products_select to fix that would hand staff the cost
--   price via PostgREST, which is the one thing we may not do.
--
-- So the two writes take different routes:
--
--   INSERT — direct, policy-gated, no RETURNING. lib/actions/product.ts now
--            generates the UUID itself, so nothing is read back and no SELECT
--            policy is needed. A BEFORE INSERT trigger pins the cost price to
--            zero for anyone who is not allowed to set it, so a hand-rolled
--            PostgREST call cannot smuggle one in.
--
--   UPDATE — through update_product_as_role(), SECURITY DEFINER. It is the only
--            way staff touch an existing row, it names every column it will
--            write, and it leaves purchase_price_paisa and deleted_at alone for
--            anyone but an admin. products_update stays admin-only, which is
--            what keeps soft-delete (an UPDATE of deleted_at) out of reach.
--
-- What staff explicitly do NOT get:
--   • reading purchase_price_paisa      — products_select unchanged, view NULLs it
--   • writing purchase_price_paisa      — trigger on INSERT, omitted on UPDATE
--   • deleting / soft-deleting          — products_update and products_delete unchanged;
--                                         the UI files a deletion request instead
--
-- accountant is deliberately not added anywhere here. They cannot mutate
-- products today and this migration is not the place to change that.
--
-- Down:
--   DROP FUNCTION public.update_product_as_role(...);
--   DROP TRIGGER trg_products_cost_price_role ON public.products;
--   DROP FUNCTION public.enforce_product_cost_price_role();
--   DROP POLICY products_insert ON public.products;
--   CREATE POLICY products_insert ON public.products
--     FOR INSERT WITH CHECK (
--       public.user_has_business(business_id) AND public.user_role() = 'admin');
--   UPDATE public.page_definitions SET default_staff = false WHERE key = 'action.add_product';
--
-- Re-runnable end to end.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. INSERT: admin + staff
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS products_insert ON public.products;
CREATE POLICY products_insert ON public.products
  FOR INSERT WITH CHECK (
    public.user_has_business(business_id)
    AND public.user_role() IN ('admin', 'staff')
  );

-- ─────────────────────────────────────────────
-- 2. Cost price is not staff's to set, on any insert path
--
--    The policy above cannot express this: WITH CHECK sees the whole NEW row,
--    not which columns the caller supplied, and rejecting the row outright
--    would turn "you sent a cost price" into "your product could not be saved".
--    Pinning it to zero is the honest outcome — the product exists, and the
--    first stock purchase will set its real cost.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_product_cost_price_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.user_role() NOT IN ('admin', 'accountant') THEN
    NEW.purchase_price_paisa := 0;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_product_cost_price_role() IS
  'Iron rule #3 on the write side: a role that cannot read a cost price cannot set one.';

DROP TRIGGER IF EXISTS trg_products_cost_price_role ON public.products;
CREATE TRIGGER trg_products_cost_price_role
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_cost_price_role();

-- ─────────────────────────────────────────────
-- 3. UPDATE: the one route staff have to an existing row
--
--    purchase_price_paisa and deleted_at are absent from the UPDATE list on
--    purpose, not by omission. An admin editing cost still goes through
--    p_purchase_price_paisa below; staff pass NULL and it is ignored either way.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_product_as_role(
  p_id                    UUID,
  p_business_id           UUID,
  p_name                  TEXT,
  p_sku                   TEXT,
  p_unit                  TEXT,
  p_sale_price_paisa      BIGINT,
  p_low_stock_threshold   INTEGER,
  p_brand_id              UUID,
  p_pack_size             INTEGER,
  p_pack_name             TEXT,
  p_is_active             BOOLEAN,
  p_purchase_price_paisa  BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role TEXT := public.user_role();
BEGIN
  IF NOT public.user_has_business(p_business_id) THEN
    RAISE EXCEPTION 'Not your business' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_role NOT IN ('admin', 'staff') THEN
    RAISE EXCEPTION 'Only admins and staff can edit products'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.products SET
    name                = p_name,
    sku                 = p_sku,
    unit                = p_unit,
    sale_price_paisa    = p_sale_price_paisa,
    low_stock_threshold = p_low_stock_threshold,
    brand_id            = p_brand_id,
    pack_size           = p_pack_size,
    pack_name           = p_pack_name,
    is_active           = p_is_active,
    -- Silently kept at its current value for staff. Not an error: the form
    -- never showed them the field, so there is nothing for them to have got
    -- wrong.
    purchase_price_paisa = CASE
      WHEN v_role = 'admin' AND p_purchase_price_paisa IS NOT NULL
        THEN p_purchase_price_paisa
      ELSE purchase_price_paisa
    END
  WHERE id = p_id
    AND business_id = p_business_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_product_as_role(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, UUID, INTEGER, TEXT, BOOLEAN, BIGINT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_product_as_role(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, UUID, INTEGER, TEXT, BOOLEAN, BIGINT
) TO authenticated;

COMMENT ON FUNCTION public.update_product_as_role(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, UUID, INTEGER, TEXT, BOOLEAN, BIGINT
) IS
  'Product edit for admin and staff. Cost price is admin-only; deleted_at is untouchable here.';

-- ─────────────────────────────────────────────
-- 4. The Add Product button
--
--    resolvePageAccess() narrows this row by its permission_key, which staff
--    now hold. Without flipping the default the button stays hidden and the
--    page is only reachable by typing the URL.
-- ─────────────────────────────────────────────
--    Written as an upsert, not an UPDATE. An UPDATE quietly affects zero rows
--    when 0056's seed row is absent, and a migration that silently does nothing
--    is the hardest kind to debug — the symptom is a button that never appears
--    and a verify script that says FAIL with no explanation. This inserts the
--    row if it is missing and corrects it if it is there.
INSERT INTO public.page_definitions
  (key, label, category, sort_order,
   default_admin, default_accountant, default_staff, default_viewer,
   is_lockable, permission_key)
VALUES
  ('action.add_product', 'Add Products', 'actions', 5,
   true, false, true, false,
   false, 'products.create')
ON CONFLICT (key) DO UPDATE SET
  default_staff  = true,
  permission_key = 'products.create';

-- Say so out loud. A migration that ran but changed nothing should not look the
-- same as one that worked.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.page_definitions
     WHERE key = 'action.add_product' AND default_staff
  ) THEN
    RAISE EXCEPTION '0058 did not enable the Add Product button for staff';
  END IF;
  RAISE NOTICE '0058 applied: staff may add and edit products; cost price and delete unchanged.';
END;
$$;
