CREATE TABLE IF NOT EXISTS public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type VARCHAR(40) NOT NULL CHECK (command_type IN ('enroll_user')),
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  device_id BIGINT NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  result JSONB,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON public.device_commands(command_type, status, available_at, created_at);
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;