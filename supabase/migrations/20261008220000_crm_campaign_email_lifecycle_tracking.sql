ALTER TABLE public.crm_campaign_messages
  ADD COLUMN IF NOT EXISTS sending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rfc_message_id TEXT,
  ADD COLUMN IF NOT EXISTS hostinger_message_id TEXT,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT,
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT;

ALTER TABLE public.crm_email_messages
  ADD COLUMN IF NOT EXISTS campaign_message_id BIGINT
    REFERENCES public.crm_campaign_messages(id) ON DELETE SET NULL;

UPDATE public.crm_email_messages AS email_message
   SET campaign_message_id = campaign_message.id,
       message_id = COALESCE(email_message.message_id, campaign_message.rfc_message_id)
  FROM public.crm_campaign_messages AS campaign_message
  JOIN public.crm_campaign_contacts AS campaign_contact
    ON campaign_contact.id = campaign_message.campaign_contact_id
 WHERE email_message.provider_message_id = format('hostinger:campaign:%s', campaign_message.id)
   AND email_message.contact_id = campaign_contact.contact_id
   AND email_message.company_id = campaign_message.company_id
   AND email_message.campaign_message_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_email_messages_campaign_message
  ON public.crm_email_messages(campaign_message_id)
  WHERE campaign_message_id IS NOT NULL;

ALTER TABLE public.crm_email_events
  ADD COLUMN IF NOT EXISTS campaign_id BIGINT
    REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campaign_contact_id BIGINT
    REFERENCES public.crm_campaign_contacts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_qualified BOOLEAN,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

UPDATE public.crm_email_events AS event
   SET campaign_id = campaign_contact.campaign_id,
       campaign_contact_id = message.campaign_contact_id
  FROM public.crm_campaign_messages AS message
  JOIN public.crm_campaign_contacts AS campaign_contact
    ON campaign_contact.id = message.campaign_contact_id
 WHERE event.campaign_message_id = message.id
   AND (event.campaign_id IS NULL OR event.campaign_contact_id IS NULL);

INSERT INTO public.crm_email_events (
  company_id, campaign_id, campaign_contact_id, campaign_message_id,
  event_type, provider_event_id, event_time, metadata
)
SELECT message.company_id,
       campaign_contact.campaign_id,
       campaign_contact.id,
       message.id,
       'sent',
       COALESCE(message.provider_message_id, format('campaign:sent:%s', message.id)),
       message.sent_at,
       jsonb_build_object('source', 'campaign_send_record_backfill')
  FROM public.crm_campaign_messages AS message
  JOIN public.crm_campaign_contacts AS campaign_contact
    ON campaign_contact.id = message.campaign_contact_id
 WHERE message.sent_at IS NOT NULL
ON CONFLICT (provider_event_id) DO NOTHING;

UPDATE public.crm_email_events
   SET is_qualified = event_type NOT IN ('opened', 'clicked')
 WHERE is_qualified IS NULL;

ALTER TABLE public.crm_email_events
  ALTER COLUMN is_qualified SET DEFAULT TRUE,
  ALTER COLUMN is_qualified SET NOT NULL;

UPDATE public.crm_campaign_messages AS message
   SET delivered_at = COALESCE(message.delivered_at, lifecycle.delivered_at),
       bounced_at = COALESCE(message.bounced_at, lifecycle.bounced_at),
       opened_at = COALESCE(message.opened_at, lifecycle.opened_at),
       clicked_at = COALESCE(message.clicked_at, lifecycle.clicked_at),
       replied_at = COALESCE(message.replied_at, lifecycle.replied_at)
  FROM (
    SELECT campaign_message_id,
           MIN(event_time) FILTER (WHERE event_type = 'delivered') AS delivered_at,
           MIN(event_time) FILTER (WHERE event_type = 'bounced') AS bounced_at,
           MIN(event_time) FILTER (WHERE event_type = 'opened' AND is_qualified) AS opened_at,
           MIN(event_time) FILTER (WHERE event_type = 'clicked' AND is_qualified) AS clicked_at,
           MIN(event_time) FILTER (WHERE event_type = 'replied') AS replied_at
      FROM public.crm_email_events
     WHERE campaign_message_id IS NOT NULL
     GROUP BY campaign_message_id
  ) AS lifecycle
 WHERE lifecycle.campaign_message_id = message.id;

UPDATE public.crm_campaign_messages
   SET failed_at = COALESCE(failed_at, updated_at)
 WHERE status = 'failed';

ALTER TABLE public.crm_email_events
  DROP CONSTRAINT IF EXISTS crm_email_events_event_type_check;

ALTER TABLE public.crm_email_events
  ADD CONSTRAINT crm_email_events_event_type_check
  CHECK (event_type IN (
    'queued', 'sending', 'sent', 'failed', 'delivered', 'bounced',
    'opened', 'clicked', 'replied', 'complained', 'unsubscribed'
  ));

CREATE INDEX IF NOT EXISTS idx_crm_email_events_campaign_type_time
  ON public.crm_email_events(campaign_id, event_type, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_crm_email_events_message_qualified
  ON public.crm_email_events(campaign_message_id, event_type, is_qualified);

CREATE TABLE IF NOT EXISTS public.crm_campaign_tracking_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id BIGINT NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  campaign_contact_id BIGINT NOT NULL REFERENCES public.crm_campaign_contacts(id) ON DELETE CASCADE,
  campaign_message_id BIGINT NOT NULL REFERENCES public.crm_campaign_messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened', 'clicked')),
  target_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_tracking_tokens_message
  ON public.crm_campaign_tracking_tokens(campaign_message_id, event_type);

ALTER TABLE public.crm_campaign_tracking_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_campaign_tracking_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_campaign_tracking_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.record_crm_campaign_message_queued()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    event_type, provider_event_id, event_time
  )
  SELECT NEW.company_id,
         campaign_contact.campaign_id,
         campaign_contact.id,
         NEW.id,
         'queued',
         format('campaign:queued:%s', NEW.id),
         COALESCE(NEW.created_at, clock_timestamp())
    FROM public.crm_campaign_contacts AS campaign_contact
   WHERE campaign_contact.id = NEW.campaign_contact_id
  ON CONFLICT (provider_event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_campaign_message_queued_event ON public.crm_campaign_messages;
CREATE TRIGGER crm_campaign_message_queued_event
  AFTER INSERT ON public.crm_campaign_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.record_crm_campaign_message_queued();

INSERT INTO public.crm_email_events (
  company_id, campaign_id, campaign_contact_id, campaign_message_id,
  event_type, provider_event_id, event_time, metadata
)
SELECT message.company_id,
       campaign_contact.campaign_id,
       campaign_contact.id,
       message.id,
       'queued',
       format('campaign:queued:%s', message.id),
       message.created_at,
       jsonb_build_object('source', 'campaign_queue_backfill')
  FROM public.crm_campaign_messages AS message
  JOIN public.crm_campaign_contacts AS campaign_contact
    ON campaign_contact.id = message.campaign_contact_id
 WHERE message.status IN ('queued', 'processing')
ON CONFLICT (provider_event_id) DO NOTHING;

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
         sending_at = COALESCE(sending_at, clock_timestamp()),
         claimed_at = clock_timestamp(),
         attempt_count = attempt_count + 1,
         updated_at = clock_timestamp()
   WHERE id = selected_message.id
   RETURNING * INTO selected_message;

  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    event_type, provider_event_id, metadata
  )
  SELECT selected_message.company_id,
         campaign_contact.campaign_id,
         campaign_contact.id,
         selected_message.id,
         'sending',
         format('campaign:sending:%s:%s', selected_message.id, selected_message.attempt_count),
         jsonb_build_object('worker_id', p_worker_id)
    FROM public.crm_campaign_contacts AS campaign_contact
   WHERE campaign_contact.id = selected_message.campaign_contact_id
  ON CONFLICT (provider_event_id) DO NOTHING;

  RETURN NEXT selected_message;
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
  PERFORM 1 FROM public.crm_campaign_send_state WHERE singleton = TRUE FOR UPDATE;

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

  INSERT INTO public.crm_campaign_send_events (campaign_id, campaign_message_id, provider_message_id, sent_at)
  VALUES (send_reservation.campaign_id, send_reservation.campaign_message_id, p_provider_message_id, sent_timestamp)
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
    message_row.company_id,
    contact_row.campaign_id,
    contact_row.id,
    message_row.id,
    'sent',
    p_provider_message_id,
    sent_timestamp,
    jsonb_build_object('worker_id', p_worker_id)
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
    contact_row.company_id,
    contact_row.contact_id,
    'campaign_email_sent',
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

CREATE OR REPLACE FUNCTION public.record_crm_campaign_tracking_event(
  p_token UUID,
  p_event_id UUID,
  p_expected_event_type TEXT,
  p_is_qualified BOOLEAN,
  p_user_agent TEXT,
  p_ip_address TEXT,
  p_metadata JSONB
)
RETURNS TABLE (matched BOOLEAN, event_type TEXT, target_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_row public.crm_campaign_tracking_tokens;
  event_timestamp TIMESTAMPTZ := clock_timestamp();
  logical_type TEXT;
BEGIN
  SELECT * INTO token_row
    FROM public.crm_campaign_tracking_tokens
   WHERE token = p_token;

  IF token_row.token IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  logical_type := token_row.event_type;
  IF logical_type <> p_expected_event_type THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    event_type, provider_event_id, event_time, is_qualified,
    user_agent, ip_address, metadata
  )
  SELECT message.company_id,
         token_row.campaign_id,
         token_row.campaign_contact_id,
         token_row.campaign_message_id,
         logical_type,
         format('tracking:%s:%s', p_token, p_event_id),
         event_timestamp,
         p_is_qualified,
         NULLIF(p_user_agent, ''),
         NULLIF(p_ip_address, ''),
         COALESCE(p_metadata, '{}'::JSONB)
    FROM public.crm_campaign_messages AS message
   WHERE message.id = token_row.campaign_message_id
  ON CONFLICT (provider_event_id) DO NOTHING;

  IF p_is_qualified THEN
    IF logical_type = 'opened' THEN
      UPDATE public.crm_campaign_messages
         SET opened_at = COALESCE(opened_at, event_timestamp),
             status = CASE WHEN status IN ('sent', 'delivered') THEN 'opened' ELSE status END,
             updated_at = event_timestamp
       WHERE id = token_row.campaign_message_id
         AND status NOT IN ('bounced', 'failed');
    ELSE
      UPDATE public.crm_campaign_messages
         SET clicked_at = COALESCE(clicked_at, event_timestamp),
             status = CASE WHEN status IN ('sent', 'delivered', 'opened') THEN 'clicked' ELSE status END,
             updated_at = event_timestamp
       WHERE id = token_row.campaign_message_id
         AND status NOT IN ('bounced', 'failed');
    END IF;

    UPDATE public.crm_campaign_contacts
       SET status = CASE
         WHEN logical_type = 'clicked' THEN 'clicked'
         WHEN status IN ('sent', 'delivered') THEN 'opened'
         ELSE status
       END
     WHERE id = token_row.campaign_contact_id
       AND status NOT IN ('bounced', 'failed', 'replied', 'unsubscribed');
  END IF;

  RETURN QUERY SELECT TRUE, logical_type, token_row.target_url;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_crm_campaign_bounce(
  p_campaign_message_id BIGINT,
  p_provider_event_id TEXT,
  p_email_message_id BIGINT,
  p_received_at TIMESTAMPTZ,
  p_bounce_type TEXT,
  p_bounce_reason TEXT,
  p_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_row public.crm_campaign_messages;
  contact_row public.crm_campaign_contacts;
  inserted_event_id BIGINT;
BEGIN
  SELECT * INTO message_row
    FROM public.crm_campaign_messages
   WHERE id = p_campaign_message_id
   FOR UPDATE;
  IF message_row.id IS NULL OR message_row.sent_at IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO contact_row
    FROM public.crm_campaign_contacts
   WHERE id = message_row.campaign_contact_id
   FOR UPDATE;

  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    message_id, event_type, provider_event_id, event_time, is_qualified, metadata
  )
  VALUES (
    message_row.company_id, contact_row.campaign_id, contact_row.id,
    message_row.id, p_email_message_id, 'bounced', p_provider_event_id,
    p_received_at, TRUE, COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING id INTO inserted_event_id;

  UPDATE public.crm_campaign_messages
     SET bounced_at = COALESCE(bounced_at, p_received_at),
         bounce_type = COALESCE(NULLIF(p_bounce_type, ''), bounce_type),
         bounce_reason = COALESCE(NULLIF(p_bounce_reason, ''), bounce_reason),
         status = 'bounced',
         error_message = COALESCE(NULLIF(p_bounce_reason, ''), error_message),
         updated_at = clock_timestamp()
   WHERE id = message_row.id;

  UPDATE public.crm_campaign_contacts
     SET status = 'bounced'
   WHERE id = contact_row.id
     AND status <> 'replied';

  RETURN inserted_event_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_crm_campaign_reply(
  p_campaign_message_id BIGINT,
  p_provider_event_id TEXT,
  p_email_message_id BIGINT,
  p_replied_at TIMESTAMPTZ,
  p_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_row public.crm_campaign_messages;
  contact_row public.crm_campaign_contacts;
  inserted_event_id BIGINT;
BEGIN
  SELECT * INTO message_row
    FROM public.crm_campaign_messages
   WHERE id = p_campaign_message_id
     AND sent_at IS NOT NULL
   FOR UPDATE;
  IF message_row.id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO contact_row
    FROM public.crm_campaign_contacts
   WHERE id = message_row.campaign_contact_id
   FOR UPDATE;

  INSERT INTO public.crm_email_events (
    company_id, campaign_id, campaign_contact_id, campaign_message_id,
    message_id, event_type, provider_event_id, event_time, metadata
  )
  VALUES (
    message_row.company_id, contact_row.campaign_id, contact_row.id,
    message_row.id, p_email_message_id, 'replied', p_provider_event_id,
    p_replied_at, COALESCE(p_metadata, '{}'::JSONB)
  )
  ON CONFLICT (provider_event_id) DO NOTHING
  RETURNING id INTO inserted_event_id;

  IF inserted_event_id IS NOT NULL THEN
    UPDATE public.crm_campaign_messages
       SET replied_at = COALESCE(replied_at, p_replied_at),
           status = 'replied',
           updated_at = clock_timestamp()
     WHERE id = message_row.id;

    UPDATE public.crm_campaign_contacts
       SET status = 'replied'
     WHERE id = contact_row.id;
  END IF;

  RETURN inserted_event_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_crm_campaign_tracking_event(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_crm_campaign_bounce(BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_crm_campaign_reply(BIGINT, TEXT, BIGINT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_crm_campaign_tracking_event(UUID, UUID, TEXT, BOOLEAN, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_crm_campaign_bounce(BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_crm_campaign_reply(BIGINT, TEXT, BIGINT, TIMESTAMPTZ, JSONB) TO service_role;
