ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_name TEXT;

CREATE INDEX IF NOT EXISTS idx_crm_email_messages_sent_by_user
  ON public.crm_email_messages(sent_by_user_id)
  WHERE sent_by_user_id IS NOT NULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;