CREATE TABLE IF NOT EXISTS public.crm_system_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('success', 'info', 'warning', 'error')),
  source TEXT NOT NULL CHECK (char_length(source) <= 80),
  event TEXT NOT NULL CHECK (char_length(event) <= 120),
  message TEXT NOT NULL CHECK (char_length(message) <= 500),
  route TEXT CHECK (route IS NULL OR char_length(route) <= 240),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) <= 100),
  company_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (pg_column_size(metadata) <= 4096)
);

CREATE INDEX IF NOT EXISTS idx_crm_system_logs_created_at
  ON public.crm_system_logs(created_at DESC, id DESC);

ALTER TABLE public.crm_system_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_system_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.crm_system_logs TO service_role;

CREATE OR REPLACE FUNCTION public.insert_crm_system_log(
  p_level TEXT,
  p_source TEXT,
  p_event TEXT,
  p_message TEXT,
  p_route TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_company_id BIGINT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_id BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(20261001, 300);

  INSERT INTO public.crm_system_logs (
    level, source, event, message, route, request_id, company_id, metadata
  ) VALUES (
    CASE WHEN p_level IN ('success', 'info', 'warning', 'error') THEN p_level ELSE 'info' END,
    left(coalesce(nullif(p_source, ''), 'application'), 80),
    left(coalesce(nullif(p_event, ''), 'event'), 120),
    left(coalesce(nullif(p_message, ''), 'No details provided.'), 500),
    left(p_route, 240),
    left(p_request_id, 100),
    p_company_id,
    CASE
      WHEN jsonb_typeof(p_metadata) = 'object' AND pg_column_size(p_metadata) <= 4096 THEN p_metadata
      ELSE '{}'::JSONB
    END
  ) RETURNING id INTO inserted_id;

  DELETE FROM public.crm_system_logs
  WHERE id IN (
    SELECT id
    FROM public.crm_system_logs
    ORDER BY created_at DESC, id DESC
    OFFSET 300
  );

  RETURN inserted_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_crm_system_log(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_crm_system_log(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB) TO service_role;