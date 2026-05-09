-- ─────────────────────────────────────────────
-- backups — log of every export/backup run
-- ─────────────────────────────────────────────
CREATE TABLE public.backups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        REFERENCES public.businesses(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL DEFAULT 'excel'
                              CHECK (type IN ('excel', 'sql', 'pdf')),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'done', 'failed')),
  storage_path    TEXT,       -- Supabase Storage path
  file_size_bytes BIGINT,
  triggered_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_backups_business_id  ON public.backups (business_id);
CREATE INDEX idx_backups_status       ON public.backups (status);
CREATE INDEX idx_backups_created_at   ON public.backups (created_at DESC);

-- ─────────────────────────────────────────────
-- app_settings — per-business key/value config
-- Examples: defaulter_days, backup_frequency_days,
--           home_expense_in_pnl (default: false)
-- ─────────────────────────────────────────────
CREATE TABLE public.app_settings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        REFERENCES public.businesses(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  value         TEXT        NOT NULL,
  updated_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, key)
);

CREATE INDEX idx_app_settings_business_id ON public.app_settings (business_id);

-- ─────────────────────────────────────────────
-- Default settings inserted via seed.sql
-- ─────────────────────────────────────────────
