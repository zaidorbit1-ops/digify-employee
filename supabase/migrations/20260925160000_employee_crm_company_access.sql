CREATE TABLE IF NOT EXISTS public.employee_crm_company_access (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_crm_access_employee ON public.employee_crm_company_access(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_crm_access_company ON public.employee_crm_company_access(company_id);

ALTER TABLE public.employee_crm_company_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_crm_company_access_admin ON public.employee_crm_company_access;
CREATE POLICY employee_crm_company_access_admin ON public.employee_crm_company_access
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());
