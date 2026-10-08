ALTER TABLE public.crm_campaigns
  DROP CONSTRAINT IF EXISTS crm_campaigns_status_check;

UPDATE public.crm_campaigns SET status = 'manual_pause' WHERE status = 'paused';
UPDATE public.crm_campaigns SET status = 'rate_limit_pause' WHERE status = 'paused_daily_limit';

ALTER TABLE public.crm_campaigns
  ADD CONSTRAINT crm_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'running', 'manual_pause', 'rate_limit_pause', 'completed', 'cancelled', 'failed'));

CREATE TABLE public.crm_campaign_send_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton)
);

INSERT INTO public.crm_campaign_send_state (singleton) VALUES (TRUE);

CREATE TABLE public.crm_campaign_send_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT,
  campaign_message_id BIGINT NOT NULL UNIQUE,
  provider_message_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_crm_campaign_send_events_sent_at
  ON public.crm_campaign_send_events(sent_at);

INSERT INTO public.crm_campaign_send_events (campaign_id, campaign_message_id, provider_message_id, sent_at)
SELECT campaign_contact.campaign_id,
       message.id,
       message.provider_message_id,
       message.sent_at
  FROM public.crm_campaign_messages AS message
  JOIN public.crm_campaign_contacts AS campaign_contact
    ON campaign_contact.id = message.campaign_contact_id
 WHERE message.sent_at IS NOT NULL
   AND message.provider_message_id IS NOT NULL
ON CONFLICT (campaign_message_id) DO NOTHING;

CREATE TABLE public.crm_campaign_send_reservations (
  reservation_id UUID PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  campaign_message_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.crm_campaign_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_send_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_campaign_send_reservations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.crm_campaign_send_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_campaign_send_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.crm_campaign_send_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_campaign_send_state TO service_role;
GRANT ALL ON TABLE public.crm_campaign_send_events TO service_role;
GRANT ALL ON TABLE public.crm_campaign_send_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.crm_campaign_rolling_send_status()
RETURNS TABLE (rolling_limit INTEGER, sent_last_24_hours INTEGER, available_capacity INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent_count INTEGER;
  reserved_count INTEGER;
BEGIN
  PERFORM 1 FROM public.crm_campaign_send_state WHERE singleton = TRUE FOR UPDATE;

  UPDATE public.crm_campaign_messages AS message
     SET status = 'queued',
         attempt_count = GREATEST(0, message.attempt_count - 1),
         updated_at = clock_timestamp()
    FROM public.crm_campaign_send_reservations AS reservation
   WHERE reservation.campaign_message_id = message.id
     AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
     AND message.status = 'processing';

  UPDATE public.crm_campaign_contacts AS campaign_contact
     SET status = 'queued'
    FROM public.crm_campaign_send_reservations AS reservation
    JOIN public.crm_campaign_messages AS message
      ON message.id = reservation.campaign_message_id
   WHERE campaign_contact.id = message.campaign_contact_id
     AND reservation.created_at < clock_timestamp() - INTERVAL '5 minutes'
     AND campaign_contact.status = 'processing';

  DELETE FROM public.crm_campaign_send_reservations
   WHERE created_at < clock_timestamp() - INTERVAL '5 minutes';

  SELECT COUNT(*)::INTEGER INTO sent_count
    FROM public.crm_campaign_send_events
   WHERE sent_at >= clock_timestamp() - INTERVAL '24 hours';

  SELECT COUNT(*)::INTEGER INTO reserved_count
    FROM public.crm_campaign_send_reservations;

  IF sent_count + reserved_count < 80 THEN
    UPDATE public.crm_campaigns
       SET status = 'running',
           updated_at = clock_timestamp()
     WHERE status = 'rate_limit_pause';
  ELSE
    UPDATE public.crm_campaigns
       SET status = 'rate_limit_pause',
           updated_at = clock_timestamp()
     WHERE status = 'running';
  END IF;

  RETURN QUERY SELECT 80, sent_count, GREATEST(0, 80 - sent_count - reserved_count);
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
  sent_count INTEGER;
  reserved_count INTEGER;
BEGIN
  PERFORM 1 FROM public.crm_campaign_send_state WHERE singleton = TRUE FOR UPDATE;

  DELETE FROM public.crm_campaign_send_reservations
   WHERE created_at < clock_timestamp() - INTERVAL '5 minutes';

  SELECT campaign.*
    INTO campaign_row
    FROM public.crm_campaign_messages AS message
    JOIN public.crm_campaign_contacts AS campaign_contact
      ON campaign_contact.id = message.campaign_contact_id
    JOIN public.crm_campaigns AS campaign
      ON campaign.id = campaign_contact.campaign_id
   WHERE message.id = p_campaign_message_id
     AND message.status = 'processing'
   FOR UPDATE OF message, campaign;

  IF campaign_row.id IS NULL OR campaign_row.status <> 'running' THEN
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

  SELECT COUNT(*)::INTEGER INTO sent_count
    FROM public.crm_campaign_send_events
   WHERE sent_at >= clock_timestamp() - INTERVAL '24 hours';

  SELECT COUNT(*)::INTEGER INTO reserved_count
    FROM public.crm_campaign_send_reservations;

  IF sent_count + reserved_count >= 80 THEN
    UPDATE public.crm_campaigns
       SET status = 'rate_limit_pause',
           updated_at = clock_timestamp()
     WHERE status = 'running';

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

    RETURN QUERY SELECT FALSE, 'rate_limit_reached'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.crm_campaign_send_reservations (reservation_id, campaign_id, campaign_message_id)
  VALUES (p_reservation_id, campaign_row.id, p_campaign_message_id);

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
  message_exists BOOLEAN;
  contact_exists BOOLEAN;
BEGIN
  PERFORM 1 FROM public.crm_campaign_send_state WHERE singleton = TRUE FOR UPDATE;

  SELECT *
    INTO send_reservation
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
  message_exists := FOUND;

  IF message_exists THEN
    SELECT * INTO contact_row
      FROM public.crm_campaign_contacts
     WHERE id = message_row.campaign_contact_id
     FOR UPDATE;
    contact_exists := FOUND;
  END IF;

  INSERT INTO public.crm_campaign_send_events (campaign_id, campaign_message_id, provider_message_id, sent_at)
  VALUES (send_reservation.campaign_id, send_reservation.campaign_message_id, p_provider_message_id, sent_timestamp)
  ON CONFLICT (campaign_message_id) DO NOTHING;

  IF message_exists THEN
    UPDATE public.crm_campaign_messages
       SET status = 'sent',
           sent_at = sent_timestamp,
           provider_message_id = p_provider_message_id,
           error_message = NULL,
           updated_at = sent_timestamp
     WHERE id = send_reservation.campaign_message_id;

    INSERT INTO public.crm_email_events (
      company_id, campaign_message_id, event_type, provider_event_id, metadata
    )
    VALUES (
      message_row.company_id,
      message_row.id,
      'sent',
      p_provider_message_id,
      jsonb_build_object('worker_id', p_worker_id)
    )
    ON CONFLICT (provider_event_id) DO NOTHING;

    IF contact_exists THEN
      UPDATE public.crm_campaign_contacts
         SET status = 'sent'
       WHERE id = message_row.campaign_contact_id;

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
    END IF;
  END IF;

  DELETE FROM public.crm_campaign_send_reservations
   WHERE reservation_id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_crm_campaign_send(p_reservation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

  PERFORM 1 FROM public.crm_campaign_send_state WHERE singleton = TRUE FOR UPDATE;

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
       SET status = CASE WHEN schedule_at > clock_timestamp() THEN 'scheduled' ELSE 'running' END,
           updated_at = clock_timestamp()
     WHERE id = p_campaign_id
     RETURNING * INTO campaign_row;
  END IF;

  RETURN campaign_row;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_campaign_rolling_send_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_crm_campaign_send(UUID, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_crm_campaign_send(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_crm_campaign_send(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_crm_campaign_manual_pause(BIGINT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_campaign_rolling_send_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_crm_campaign_send(UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_crm_campaign_send(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_crm_campaign_send(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_crm_campaign_manual_pause(BIGINT, TEXT) TO service_role;
