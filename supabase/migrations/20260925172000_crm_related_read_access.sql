DROP POLICY IF EXISTS crm_websites_crm_company_access ON public.crm_websites;
CREATE POLICY crm_websites_crm_company_access ON public.crm_websites
  FOR SELECT TO authenticated
  USING (
    public.crm_employee_has_access('crm_companies', company_id, 'read')
    OR public.crm_employee_has_access('crm_custom_fields', company_id, 'read')
    OR public.crm_employee_has_access('crm_leads', company_id, 'read')
    OR public.crm_employee_has_access('crm_webmail', company_id, 'read')
  );

DROP POLICY IF EXISTS crm_website_integrations_crm_company_access ON public.crm_website_integrations;
CREATE POLICY crm_website_integrations_crm_company_access ON public.crm_website_integrations
  FOR SELECT TO authenticated
  USING (
    public.crm_employee_has_access('crm_companies', company_id, 'read')
    OR public.crm_employee_has_access('crm_leads', company_id, 'read')
  );
