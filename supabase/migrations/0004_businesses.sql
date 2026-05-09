-- ─────────────────────────────────────────────
-- businesses — one row per business unit
-- ─────────────────────────────────────────────
CREATE TABLE public.businesses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'other'
                          CHECK (type IN ('oil', 'cigarettes', 'zameen', 'other')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_businesses_is_active ON public.businesses (is_active);

-- ─────────────────────────────────────────────
-- user_businesses — M:M join; controls which users
-- can access which businesses
-- ─────────────────────────────────────────────
CREATE TABLE public.user_businesses (
  user_id     UUID NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_id)
);

CREATE INDEX idx_user_businesses_user_id     ON public.user_businesses (user_id);
CREATE INDEX idx_user_businesses_business_id ON public.user_businesses (business_id);
