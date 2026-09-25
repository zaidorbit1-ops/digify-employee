ALTER TABLE public.crm_mailboxes
  ADD COLUMN IF NOT EXISTS last_sync_uid BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_crm_threads_mailbox_updated
  ON public.crm_email_threads(mailbox_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_messages_mailbox_thread
  ON public.crm_email_messages(mailbox_id, thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_crm_attachments_message
  ON public.crm_email_attachments(message_id);
