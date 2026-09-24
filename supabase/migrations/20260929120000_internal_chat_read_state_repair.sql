ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.conversation_members
SET last_read_at = COALESCE(last_read_at, joined_at, NOW())
WHERE last_read_at IS NULL;
