ALTER TABLE public.crm_mailboxes
  ADD COLUMN IF NOT EXISTS hostinger_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS webhook_id TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

ALTER TABLE public.crm_mailboxes
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS imap_host,
  DROP COLUMN IF EXISTS imap_port,
  DROP COLUMN IF EXISTS imap_security,
  DROP COLUMN IF EXISTS smtp_host,
  DROP COLUMN IF EXISTS smtp_port,
  DROP COLUMN IF EXISTS smtp_security,
  DROP COLUMN IF EXISTS encrypted_credentials,
  DROP COLUMN IF EXISTS last_sync_at,
  DROP COLUMN IF EXISTS last_sync_uid;

ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS hostinger_uid BIGINT,
  ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_messages_mailbox_hostinger_uid
  ON public.crm_email_messages(mailbox_id, hostinger_uid)
  WHERE hostinger_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_messages_mailbox_webhook_event
  ON public.crm_email_messages(mailbox_id, webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

ALTER TABLE public.crm_email_threads REPLICA IDENTITY FULL;
ALTER TABLE public.crm_email_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_email_threads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_email_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;