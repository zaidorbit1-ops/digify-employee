ALTER TABLE public.conversation_members
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE public.chat_messages
  ALTER COLUMN sender_employee_id DROP NOT NULL;

DROP POLICY IF EXISTS conversation_members_insert_access ON public.conversation_members;

CREATE POLICY conversation_members_insert_access ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_superadmin());