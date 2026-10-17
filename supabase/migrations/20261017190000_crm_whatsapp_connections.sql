CREATE TABLE IF NOT EXISTS public.crm_whatsapp_connections (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL UNIQUE REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connecting', 'connected', 'reconnecting')),
  connected_number VARCHAR(40),
  profile_name VARCHAR(150) NOT NULL DEFAULT 'Company WhatsApp',
  qr_code TEXT,
  last_connected_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_connections_status
  ON public.crm_whatsapp_connections(status);

ALTER TABLE public.crm_whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_whatsapp_connections_read ON public.crm_whatsapp_connections;
CREATE POLICY crm_whatsapp_connections_read
  ON public.crm_whatsapp_connections
  FOR SELECT TO authenticated
  USING (public.crm_employee_has_access('crm_whatsapp', company_id, 'read'));

DROP POLICY IF EXISTS crm_whatsapp_connections_add ON public.crm_whatsapp_connections;
CREATE POLICY crm_whatsapp_connections_add
  ON public.crm_whatsapp_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_employee_has_access('crm_whatsapp', company_id, 'add'));

DROP POLICY IF EXISTS crm_whatsapp_connections_edit ON public.crm_whatsapp_connections;
CREATE POLICY crm_whatsapp_connections_edit
  ON public.crm_whatsapp_connections
  FOR UPDATE TO authenticated
  USING (public.crm_employee_has_access('crm_whatsapp', company_id, 'edit'))
  WITH CHECK (public.crm_employee_has_access('crm_whatsapp', company_id, 'edit'));

DROP POLICY IF EXISTS crm_whatsapp_connections_delete ON public.crm_whatsapp_connections;
CREATE POLICY crm_whatsapp_connections_delete
  ON public.crm_whatsapp_connections
  FOR DELETE TO authenticated
  USING (public.crm_employee_has_access('crm_whatsapp', company_id, 'delete'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_whatsapp_connections TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.crm_whatsapp_connections_id_seq TO authenticated;

INSERT INTO public.employee_crm_module_company_access (employee_id, module, company_id)
SELECT access.employee_id, 'crm_whatsapp', access.company_id
FROM public.employee_crm_company_access access
ON CONFLICT (employee_id, module, company_id) DO NOTHING;
