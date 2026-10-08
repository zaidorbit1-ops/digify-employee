ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS hostinger_folder TEXT NOT NULL DEFAULT 'INBOX';

ALTER TABLE public.crm_email_attachments
  ADD COLUMN IF NOT EXISTS content_id TEXT;