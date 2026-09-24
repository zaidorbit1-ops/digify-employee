CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON public.chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation ON public.chat_attachments(conversation_id);

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_attachments_member_select ON public.chat_attachments;
DROP POLICY IF EXISTS chat_attachments_member_insert ON public.chat_attachments;
DROP POLICY IF EXISTS chat_attachments_owner_delete ON public.chat_attachments;

CREATE POLICY chat_attachments_member_select ON public.chat_attachments
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY chat_attachments_member_insert ON public.chat_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY chat_attachments_owner_delete ON public.chat_attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS chat_attachments_storage_select ON storage.objects;
DROP POLICY IF EXISTS chat_attachments_storage_insert ON storage.objects;
DROP POLICY IF EXISTS chat_attachments_storage_delete ON storage.objects;

CREATE POLICY chat_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY chat_attachments_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE POLICY chat_attachments_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner_id = auth.uid()::text);
