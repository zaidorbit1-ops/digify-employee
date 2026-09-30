ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES public.crm_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_company_recipient
  ON public.notifications(company_id, recipient_id, created_at DESC);

DROP POLICY IF EXISTS notifications_recipient_update ON public.notifications;
CREATE POLICY notifications_recipient_update
  ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());