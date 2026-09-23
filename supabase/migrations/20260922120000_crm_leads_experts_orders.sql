-- CRM lead lifecycle, experts, and order management.
-- This migration is additive and intentionally does not modify the website
-- integration contract. Apply after 20260918110000_crm_all_entities.sql.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS source VARCHAR(100),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.crm_leads
SET source = CASE WHEN integration_id IS NULL THEN 'manual' ELSE 'website' END
WHERE source IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_experts (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(320),
  password_hash TEXT,
  service_area VARCHAR(150),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_experts_email_unique
  ON public.crm_experts (lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_orders (
  id BIGSERIAL PRIMARY KEY,
  public_order_id VARCHAR(4) NOT NULL CHECK (public_order_id ~ '^[0-9]{4}$'),
  lead_id BIGINT NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  expert_id BIGINT NOT NULL REFERENCES public.crm_experts(id) ON DELETE RESTRICT,
  service_name VARCHAR(255) NOT NULL,
  service_charges NUMERIC(12, 2) NOT NULL CHECK (service_charges >= 0),
  service_deadline TIMESTAMPTZ NOT NULL,
  is_writing BOOLEAN NOT NULL DEFAULT false,
  word_count INTEGER CHECK (word_count IS NULL OR word_count >= 0),
  subject_area VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (public_order_id)
);

CREATE TABLE IF NOT EXISTS public.crm_order_notes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.crm_orders(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.crm_orders(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_active_company_status
  ON public.crm_leads(company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_trash
  ON public.crm_leads(deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_orders_lead_created
  ON public.crm_orders(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_orders_status_deadline
  ON public.crm_orders(status, service_deadline);
CREATE INDEX IF NOT EXISTS idx_crm_orders_expert
  ON public.crm_orders(expert_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_order_notes_order
  ON public.crm_order_notes(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_order_events_order
  ON public.crm_order_events(order_id, created_at ASC);

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'crm_experts', 'crm_orders', 'crm_order_notes', 'crm_order_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_superadmin_access', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin())',
      table_name || '_superadmin_access', table_name
    );
  END LOOP;
END
$$;