CREATE OR REPLACE FUNCTION public.crm_employee_has_any_company_access(requested_company_id BIGINT)
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
     AND access.company_id = requested_company_id
     AND access.module = permission.module
    WHERE profile.user_id = auth.uid()
      AND profile.role = 'employee'
      AND profile.is_active = true
      AND permission.module LIKE 'crm_%'
      AND permission.can_read
  );
$$;

REVOKE ALL ON FUNCTION public.crm_employee_has_any_company_access(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_employee_has_any_company_access(BIGINT) TO authenticated;

DROP POLICY IF EXISTS crm_companies_crm_company_access ON public.crm_companies;
CREATE POLICY crm_companies_crm_company_access ON public.crm_companies
  FOR SELECT TO authenticated
  USING (public.crm_employee_has_any_company_access(id));
