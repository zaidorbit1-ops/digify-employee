ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_url TEXT;