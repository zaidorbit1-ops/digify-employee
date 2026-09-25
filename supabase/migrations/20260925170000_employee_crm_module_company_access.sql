CREATE TABLE IF NOT EXISTS public.employee_crm_module_company_access (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  module VARCHAR(80) NOT NULL,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, module, company_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_crm_module_access_employee ON public.employee_crm_module_company_access(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_crm_module_access_module ON public.employee_crm_module_company_access(module);
CREATE INDEX IF NOT EXISTS idx_employee_crm_module_access_company ON public.employee_crm_module_company_access(company_id);

ALTER TABLE public.employee_crm_module_company_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_crm_module_company_access_admin ON public.employee_crm_module_company_access;
CREATE POLICY employee_crm_module_company_access_admin ON public.employee_crm_module_company_access
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

INSERT INTO public.employee_crm_module_company_access (employee_id, module, company_id)
SELECT access.employee_id, modules.module, access.company_id
FROM public.employee_crm_company_access access
CROSS JOIN (VALUES
  ('crm_companies'), ('crm_custom_fields'), ('crm_leads'), ('crm_experts'),
  ('crm_orders'), ('crm_contacts'), ('crm_segments'), ('crm_webmail'),
  ('crm_email_templates'), ('crm_campaigns'), ('crm_automations'), ('crm_analytics')
) AS modules(module)
ON CONFLICT (employee_id, module, company_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.crm_employee_has_access(
  requested_module TEXT,
  requested_company_id BIGINT,
  requested_action TEXT DEFAULT 'read'
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.permissions permission ON permission.employee_id = profile.employee_id
    JOIN public.employee_crm_module_company_access access
      ON access.employee_id = profile.employee_id
     AND access.module = requested_module
     AND access.company_id = requested_company_id
    WHERE profile.user_id = auth.uid()
      AND profile.role = 'employee'
      AND profile.is_active = true
      AND permission.module = requested_module
      AND CASE requested_action
        WHEN 'add' THEN permission.can_add
        WHEN 'edit' THEN permission.can_edit
        WHEN 'delete' THEN permission.can_delete
        ELSE permission.can_read
      END
  );
$$;
