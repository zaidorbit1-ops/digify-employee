ALTER TABLE public.crm_campaign_send_events
  ADD COLUMN IF NOT EXISTS mailbox_id BIGINT REFERENCES public.crm_mailboxes(id) ON DELETE CASCADE;

UPDATE public.crm_campaign_send_events AS send_event
   SET mailbox_id = campaign.mailbox_id
  FROM public.crm_campaigns AS campaign
 WHERE campaign.id = send_event.campaign_id
   AND send_event.mailbox_id IS NULL;

ALTER TABLE public.crm_campaign_send_reservations
  ADD COLUMN IF NOT EXISTS mailbox_id BIGINT REFERENCES public.crm_mailboxes(id) ON DELETE CASCADE;

UPDATE public.crm_campaign_send_reservations AS reservation
   SET mailbox_id = campaign.mailbox_id
  FROM public.crm_campaigns AS campaign
 WHERE campaign.id = reservation.campaign_id
   AND reservation.mailbox_id IS NULL;

UPDATE public.crm_campaign_messages AS message
   SET status = 'queued',
       attempt_count = GREATEST(0, message.attempt_count - 1),
       updated_at = clock_timestamp()
  FROM public.crm_campaign_send_reservations AS reservation
 WHERE reservation.campaign_message_id = message.id
   AND reservation.mailbox_id IS NULL
   AND message.status = 'processing';

DELETE FROM public.crm_campaign_send_reservations
 WHERE mailbox_id IS NULL;

ALTER TABLE public.crm_campaign_send_reservations
  ALTER COLUMN mailbox_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_campaign_send_events_mailbox_sent_at
  ON public.crm_campaign_send_events(mailbox_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_send_reservations_mailbox_created
  ON public.crm_campaign_send_reservations(mailbox_id, created_at);

DROP FUNCTION IF EXISTS public.crm_campaign_rolling_send_status();

CREATE OR REPLACE FUNCTION public.crm_campaign_rolling_send_status(p_company_id BIGINT)
RETURNS TABLE (
  mailbox_id BIGINT,
  company_id BIGINT,
  email_address TEXT,
  rolling_limit INTEGER,
  sent_last_24_hours INTEGER,
  reserved_sends INTEGER,
  available_capacity INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mailbox_row RECORD;
  sent_count INTEGER;
  reserved_count INTEGER;
  mailbox_limit CONSTANT INTEGER := 80;
BEGIN
  FOR mailbox_row IN
    SELECT mailbox.id, mailbox.company_id, mailbox.email_address
      FROM public.crm_mailboxes AS mailbox
     WHERE mailbox.status = 'connected'
       AND (p_company_id IS NULL OR mailbox.company_id = p_company_id)
     ORDER BY mailbox.id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('crm-campaign-mailbox:' || mailbox_row.id::TEXT, 0));

    UPDATE public.crm_campaign_messages AS message
       SET status = 'queued',
           attempt_count = GREATEST(0, message.attempt_count - 1),
           updated_at = clock_timestamp()
      FROM public.crm_campaign_send_reservations AS reservation
     WHERE reservation.campaign_message_id = message.id
       AND reservation.mailbox_id = mailbox_row.id
       AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
       AND message.status = 'processing';

    UPDATE public.crm_campaign_contacts AS campaign_contact
       SET status = 'queued'
      FROM public.crm_campaign_send_reservations AS reservation
      JOIN public.crm_campaign_messages AS message
        ON message.id = reservation.campaign_message_id
     WHERE campaign_contact.id = message.campaign_contact_id
       AND reservation.mailbox_id = mailbox_row.id
       AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
       AND campaign_contact.status = 'processing';

    DELETE FROM public.crm_campaign_send_reservations AS reservation
     WHERE reservation.mailbox_id = mailbox_row.id
       AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes';

    SELECT COUNT(*)::INTEGER INTO sent_count
      FROM public.crm_campaign_send_events AS send_event
     WHERE send_event.mailbox_id = mailbox_row.id
       AND send_event.sent_at >= clock_timestamp() - INTERVAL '24 hours';

    SELECT COUNT(*)::INTEGER INTO reserved_count
      FROM public.crm_campaign_send_reservations AS reservation
     WHERE reservation.mailbox_id = mailbox_row.id;

    IF sent_count + reserved_count < mailbox_limit THEN
      UPDATE public.crm_campaigns AS campaign
         SET status = CASE
               WHEN campaign.schedule_at > clock_timestamp() THEN 'scheduled'
               ELSE 'running'
             END,
             updated_at = clock_timestamp()
       WHERE campaign.mailbox_id = mailbox_row.id
         AND campaign.status = 'rate_limit_pause';
    ELSE
      UPDATE public.crm_campaigns AS campaign
         SET status = 'rate_limit_pause',
             updated_at = clock_timestamp()
       WHERE campaign.mailbox_id = mailbox_row.id
         AND campaign.status = 'running';
    END IF;

    mailbox_id := mailbox_row.id;
    company_id := mailbox_row.company_id;
    email_address := mailbox_row.email_address;
    rolling_limit := mailbox_limit;
    sent_last_24_hours := sent_count;
    reserved_sends := reserved_count;
    available_capacity := GREATEST(0, mailbox_limit - sent_count - reserved_count);
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_crm_campaign_send(
  p_reservation_id UUID,
  p_campaign_message_id BIGINT
)
RETURNS TABLE (allowed BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaign_row public.crm_campaigns;
  message_row public.crm_campaign_messages;
  mailbox_row public.crm_mailboxes;
  target_mailbox_id BIGINT;
  sent_count INTEGER;
  reserved_count INTEGER;
  mailbox_limit CONSTANT INTEGER := 80;
BEGIN
  SELECT campaign.mailbox_id
    INTO target_mailbox_id
    FROM public.crm_campaign_messages AS message
    JOIN public.crm_campaign_contacts AS campaign_contact
      ON campaign_contact.id = message.campaign_contact_id
    JOIN public.crm_campaigns AS campaign
      ON campaign.id = campaign_contact.campaign_id
   WHERE message.id = p_campaign_message_id;

  IF target_mailbox_id IS NULL THEN
    UPDATE public.crm_campaign_messages
       SET status = 'queued',
           attempt_count = GREATEST(0, attempt_count - 1),
           updated_at = clock_timestamp()
     WHERE id = p_campaign_message_id
       AND status = 'processing';
    UPDATE public.crm_campaign_contacts AS campaign_contact
       SET status = 'queued'
      FROM public.crm_campaign_messages AS message
     WHERE message.id = p_campaign_message_id
       AND campaign_contact.id = message.campaign_contact_id
       AND campaign_contact.status = 'processing';
    RETURN QUERY SELECT FALSE, 'mailbox_not_connected'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('crm-campaign-mailbox:' || target_mailbox_id::TEXT, 0));

  SELECT campaign.*
    INTO campaign_row
    FROM public.crm_campaign_messages AS message
    JOIN public.crm_campaign_contacts AS campaign_contact
      ON campaign_contact.id = message.campaign_contact_id
    JOIN public.crm_campaigns AS campaign
      ON campaign.id = campaign_contact.campaign_id
   WHERE message.id = p_campaign_message_id
     AND message.status = 'processing'
   FOR UPDATE OF campaign;

  SELECT *
    INTO message_row
    FROM public.crm_campaign_messages
   WHERE id = p_campaign_message_id
     AND status = 'processing'
   FOR UPDATE;

  IF campaign_row.id IS NULL OR campaign_row.status <> 'running' OR message_row.id IS NULL THEN
    UPDATE public.crm_campaign_messages
       SET status = 'queued',
           attempt_count = GREATEST(0, attempt_count - 1),
           updated_at = clock_timestamp()
     WHERE id = p_campaign_message_id
       AND status = 'processing';

    UPDATE public.crm_campaign_contacts AS campaign_contact
       SET status = 'queued'
      FROM public.crm_campaign_messages AS message
     WHERE message.id = p_campaign_message_id
       AND campaign_contact.id = message.campaign_contact_id
       AND campaign_contact.status = 'processing';

    RETURN QUERY SELECT FALSE, 'campaign_not_running'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO mailbox_row
    FROM public.crm_mailboxes
   WHERE id = campaign_row.mailbox_id
     AND status = 'connected';
  IF mailbox_row.id IS NULL THEN
    UPDATE public.crm_campaign_messages
       SET status = 'queued',
           attempt_count = GREATEST(0, attempt_count - 1),
           updated_at = clock_timestamp()
     WHERE id = p_campaign_message_id
       AND status = 'processing';
    UPDATE public.crm_campaign_contacts AS campaign_contact
       SET status = 'queued'
      FROM public.crm_campaign_messages AS message
     WHERE message.id = p_campaign_message_id
       AND campaign_contact.id = message.campaign_contact_id
       AND campaign_contact.status = 'processing';
    RETURN QUERY SELECT FALSE, 'mailbox_not_connected'::TEXT;
    RETURN;
  END IF;

  IF mailbox_row.id <> target_mailbox_id THEN
    RAISE EXCEPTION 'Campaign sending mailbox changed while reserving a message.';
  END IF;

  UPDATE public.crm_campaign_messages AS message
     SET status = 'queued',
         attempt_count = GREATEST(0, message.attempt_count - 1),
         updated_at = clock_timestamp()
    FROM public.crm_campaign_send_reservations AS reservation
   WHERE reservation.campaign_message_id = message.id
     AND reservation.mailbox_id = mailbox_row.id
     AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
     AND message.status = 'processing';

  UPDATE public.crm_campaign_contacts AS campaign_contact
     SET status = 'queued'
    FROM public.crm_campaign_send_reservations AS reservation
    JOIN public.crm_campaign_messages AS message
      ON message.id = reservation.campaign_message_id
   WHERE campaign_contact.id = message.campaign_contact_id
     AND reservation.mailbox_id = mailbox_row.id
     AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
     AND campaign_contact.status = 'processing';

  DELETE FROM public.crm_campaign_send_reservations AS reservation
   WHERE reservation.mailbox_id = mailbox_row.id
     AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes';

  SELECT COUNT(*)::INTEGER INTO sent_count
    FROM public.crm_campaign_send_events AS send_event
   WHERE send_event.mailbox_id = mailbox_row.id
     AND send_event.sent_at >= clock_timestamp() - INTERVAL '24 hours';

  SELECT COUNT(*)::INTEGER INTO reserved_count
    FROM public.crm_campaign_send_reservations AS reservation
   WHERE reservation.mailbox_id = mailbox_row.id;

  IF sent_count + reserved_count >= mailbox_limit THEN
    UPDATE public.crm_campaigns
       SET status = 'rate_limit_pause',
           updated_at = clock_timestamp()
     WHERE id = campaign_row.id
       AND status = 'running';

    UPDATE public.crm_campaign_messages
       SET status = 'queued',
           attempt_count = GREATEST(0, attempt_count - 1),
           updated_at = clock_timestamp()
     WHERE id = p_campaign_message_id
       AND status = 'processing';

    UPDATE public.crm_campaign_contacts AS campaign_contact
       SET status = 'queued'
      FROM public.crm_campaign_messages AS message
     WHERE message.id = p_campaign_message_id
       AND campaign_contact.id = message.campaign_contact_id
       AND campaign_contact.status = 'processing';

    UPDATE public.crm_campaigns AS campaign
       SET status = 'rate_limit_pause',
           updated_at = clock_timestamp()
     WHERE campaign.mailbox_id = mailbox_row.id
       AND campaign.status = 'running';

    RETURN QUERY SELECT FALSE, 'rate_limit_reached'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.crm_campaign_send_reservations (
    reservation_id, campaign_id, campaign_message_id, mailbox_id
  )
  VALUES (
    p_reservation_id, campaign_row.id, p_campaign_message_id, mailbox_row.id
  );

  RETURN QUERY SELECT TRUE, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_crm_campaign_send(
  p_reservation_id UUID,
  p_provider_message_id TEXT,
  p_subject TEXT,
  p_worker_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  send_reservation public.crm_campaign_send_reservations;
  sent_timestamp TIMESTAMPTZ := clock_timestamp();
  contact_row public.crm_campaign_contacts;
  message_row public.crm_campaign_messages;
BEGIN
  SELECT * INTO send_reservation
    FROM public.crm_campaign_send_reservations
   WHERE reservation_id = p_reservation_id
   FOR UPDATE;

  IF send_reservation.reservation_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.crm_campaign_send_events
       WHERE provider_message_id = p_provider_message_id
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Campaign send reservation % was not found.', p_reservation_id;
  END IF;

  SELECT * INTO message_row
    FROM public.crm_campaign_messages
   WHERE id = send_reservation.campaign_message_id
   FOR UPDATE;
  IF message_row.id IS NULL THEN
    RAISE EXCEPTION 'Campaign message % was not found.', send_reservation.campaign_message_id;
  END IF;

  SELECT * INTO contact_row
    FROM public.crm_campaign_contacts
   WHERE id = message_row.campaign_contact_id
   FOR UPDATE;

  INSERT INTO public.crm_campaign_send_events (
    campaign_id, campaign_message_id, provider_message_id, sent_at, mailbox_id
  )
  VALUES (
    send_reservation.campaign_id, send_reservation.campaign_message_id,
    p_provider_message_id, sent_timestamp, send_reservation.mailbox_id
  )
  ON CONFLICT (campaign_message_id) DO NOTHING;

  UPDATE public.crm_campaign_messages
     SET status = 'sent',
         sent_at = COALESCE(sent_at, sent_timestamp),
         provider_message_id = p_provider_message_id,
         failed_at = NULL,
         error_message = NULL,
         updated_at = sent_timestamp
   WHERE id = send_reservation.campaign_message_id;

  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    event_type, provider_event_id, event_time, metadata
  )
  VALUES (
    message_row.company_id, contact_row.campaign_id, contact_row.id,
    message_row.id, 'sent', p_provider_message_id, sent_timestamp,
    jsonb_build_object('worker_id', p_worker_id, 'mailbox_id', send_reservation.mailbox_id)
  )
  ON CONFLICT (provider_event_id) DO NOTHING;

  UPDATE public.crm_campaign_contacts
     SET status = 'sent'
   WHERE id = contact_row.id
     AND status NOT IN ('bounced', 'replied', 'unsubscribed');

  INSERT INTO public.crm_contact_timeline (
    company_id, contact_id, event_type, event_data
  )
  VALUES (
    contact_row.company_id, contact_row.contact_id, 'campaign_email_sent',
    jsonb_build_object(
      'campaign_id', contact_row.campaign_id,
      'campaign_message_id', message_row.id,
      'provider_message_id', p_provider_message_id,
      'subject', p_subject
    )
  );

  DELETE FROM public.crm_campaign_send_reservations
   WHERE reservation_id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_crm_campaign_manual_pause(p_campaign_id BIGINT, p_action TEXT)
RETURNS public.crm_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaign_row public.crm_campaigns;
BEGIN
  IF p_action NOT IN ('pause', 'resume') THEN
    RAISE EXCEPTION 'Campaign action must be pause or resume.';
  END IF;

  SELECT * INTO campaign_row
    FROM public.crm_campaigns
   WHERE id = p_campaign_id
   FOR UPDATE;

  IF campaign_row.id IS NULL THEN
    RAISE EXCEPTION 'Campaign % was not found.', p_campaign_id;
  END IF;

  IF p_action = 'pause' AND campaign_row.status IN ('scheduled', 'running', 'rate_limit_pause') THEN
    UPDATE public.crm_campaigns
       SET status = 'manual_pause',
           updated_at = clock_timestamp()
     WHERE id = p_campaign_id
     RETURNING * INTO campaign_row;
  ELSIF p_action = 'resume' AND campaign_row.status = 'manual_pause' THEN
    UPDATE public.crm_campaigns
       SET status = CASE
             WHEN schedule_at > clock_timestamp() THEN 'scheduled'
             ELSE 'running'
           END,
           updated_at = clock_timestamp()
     WHERE id = p_campaign_id
     RETURNING * INTO campaign_row;
  END IF;

  RETURN campaign_row;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_campaign_rolling_send_status(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_campaign_rolling_send_status(BIGINT) TO service_role;
