ALTER TABLE public.crm_email_templates
  ADD COLUMN IF NOT EXISTS content_mode VARCHAR(10) NOT NULL DEFAULT 'html'
  CHECK (content_mode IN ('html', 'plain'));
