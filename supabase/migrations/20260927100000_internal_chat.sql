CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('dm', 'group', 'workspace')),
  title VARCHAR(255),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id BIGINT REFERENCES public.employees(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_admin BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (conversation_id, user_id),
  UNIQUE (conversation_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_employee_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_reads (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON public.conversation_members(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_employee ON public.conversation_members(employee_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created ON public.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_reads_conversation_user ON public.chat_reads(conversation_id, user_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_members ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN sender_employee_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_chat_access()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_members cm
    WHERE cm.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS conversations_member_access ON public.conversations;
DROP POLICY IF EXISTS conversations_insert_access ON public.conversations;
DROP POLICY IF EXISTS conversation_members_member_access ON public.conversation_members;
DROP POLICY IF EXISTS conversation_members_insert_access ON public.conversation_members;
DROP POLICY IF EXISTS chat_messages_member_access ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert_access ON public.chat_messages;
DROP POLICY IF EXISTS chat_reads_member_access ON public.chat_reads;
DROP POLICY IF EXISTS chat_reads_write_access ON public.chat_reads;

CREATE POLICY conversations_member_access ON public.conversations
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY conversations_insert_access ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY conversation_members_member_access ON public.conversation_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY conversation_members_insert_access ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY chat_messages_member_access ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY chat_messages_insert_access ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid() AND
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY chat_reads_member_access ON public.chat_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY chat_reads_write_access ON public.chat_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reads;
  END IF;
END $$;
