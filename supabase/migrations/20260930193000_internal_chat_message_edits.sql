ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_created
  ON public.chat_messages(sender_user_id, created_at DESC);