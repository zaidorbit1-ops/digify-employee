ALTER TABLE public.crm_websites
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_crm_websites_custom_fields
  ON public.crm_websites USING gin (custom_fields);
