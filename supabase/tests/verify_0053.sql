-- Verify 0053 applied. Every column must say true.
SELECT
  (SELECT count(*) = 5 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='customer_categories'
       AND column_name IN ('description','color','sort_order','is_active','deleted_at'))
                                                              AS category_columns,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
            AND indexname='idx_customer_categories_business_name')  AS unique_name_index,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
            AND indexname='idx_customer_categories_business_active') AS ordering_index,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
            AND indexname='idx_customers_category')                  AS customer_category_index,
  EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname='customer_categories_color_hex')           AS colour_check,
  -- The SELECT policy must hide soft-deleted rows, or deleted_at is decoration.
  (SELECT qual LIKE '%deleted_at IS NULL%' FROM pg_policies
     WHERE schemaname='public' AND tablename='customer_categories'
       AND policyname='customer_categories_select')                  AS select_hides_deleted,
  -- Nobody may hard-delete a category.
  (SELECT qual = 'false' FROM pg_policies
     WHERE schemaname='public' AND tablename='customer_categories'
       AND policyname='customer_categories_delete')                  AS no_hard_delete,
  -- Every business has at least one category to pick from.
  NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE NOT EXISTS (
      SELECT 1 FROM public.customer_categories c
       WHERE c.business_id = b.id AND c.deleted_at IS NULL))         AS every_business_seeded;

-- No customer may point at a category that is gone. Expect 0 rows.
SELECT c.id, c.name, c.category_id
  FROM public.customers c
 WHERE c.category_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.customer_categories k WHERE k.id = c.category_id);

-- What the seed did, per business.
SELECT b.name AS business, count(*) FILTER (WHERE k.deleted_at IS NULL) AS categories
  FROM public.businesses b
  LEFT JOIN public.customer_categories k ON k.business_id = b.id
 GROUP BY b.name ORDER BY b.name;
