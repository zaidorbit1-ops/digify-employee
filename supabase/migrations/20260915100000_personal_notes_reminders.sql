CREATE TABLE IF NOT EXISTS public.personal_notes (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_notes_owner_remind_at
  ON public.personal_notes(owner_user_id, remind_at);

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_notes_owner_access ON public.personal_notes;
CREATE POLICY personal_notes_owner_access
  ON public.personal_notes
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
