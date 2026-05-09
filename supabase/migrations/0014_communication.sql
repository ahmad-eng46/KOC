-- ─────────────────────────────────────────────
-- sms_log — record of every outbound SMS/WhatsApp
-- ─────────────────────────────────────────────
CREATE TABLE public.sms_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id   UUID        REFERENCES public.customers(id)           ON DELETE SET NULL,
  channel       TEXT        NOT NULL DEFAULT 'sms'
                            CHECK (channel IN ('sms', 'whatsapp')),
  to_number     TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  provider_sid  TEXT,       -- Twilio MessageSid or Meta message ID
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sms_log_business_id  ON public.sms_log (business_id);
CREATE INDEX idx_sms_log_customer_id  ON public.sms_log (customer_id);
CREATE INDEX idx_sms_log_status       ON public.sms_log (status);
CREATE INDEX idx_sms_log_created_at   ON public.sms_log (business_id, created_at DESC);
