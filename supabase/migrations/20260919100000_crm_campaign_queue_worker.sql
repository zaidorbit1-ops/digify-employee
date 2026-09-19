CREATE INDEX IF NOT EXISTS idx_crm_campaign_messages_due
  ON public.crm_campaign_messages(status, scheduled_at, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_contacts_campaign_status
  ON public.crm_campaign_contacts(campaign_id, status);

CREATE OR REPLACE FUNCTION public.claim_crm_campaign_message(p_worker_id TEXT)
RETURNS SETOF public.crm_campaign_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_message public.crm_campaign_messages;
BEGIN
  SELECT message.*
    INTO selected_message
    FROM public.crm_campaign_messages AS message
    JOIN public.crm_campaign_contacts AS campaign_contact
      ON campaign_contact.id = message.campaign_contact_id
    JOIN public.crm_campaigns AS campaign
      ON campaign.id = campaign_contact.campaign_id
   WHERE message.status = 'queued'
     AND message.scheduled_at <= NOW()
     AND (message.next_attempt_at IS NULL OR message.next_attempt_at <= NOW())
     AND campaign.status = 'running'
   ORDER BY message.scheduled_at, message.id
   FOR UPDATE OF message SKIP LOCKED
   LIMIT 1;

  IF selected_message.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.crm_campaign_messages
     SET status = 'processing',
         claimed_at = NOW(),
         attempt_count = attempt_count + 1,
         updated_at = NOW()
   WHERE id = selected_message.id
   RETURNING * INTO selected_message;

  RETURN NEXT selected_message;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_crm_campaign_message(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_crm_campaign_message(TEXT) TO service_role;
