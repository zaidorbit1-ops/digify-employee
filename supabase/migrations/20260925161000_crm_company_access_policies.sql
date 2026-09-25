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
    JOIN public.employee_crm_company_access access ON access.employee_id = profile.employee_id
    WHERE profile.user_id = auth.uid()
      AND profile.role = 'employee'
      AND profile.is_active = true
      AND permission.module = requested_module
      AND access.company_id = requested_company_id
      AND CASE requested_action
        WHEN 'add' THEN permission.can_add
        WHEN 'edit' THEN permission.can_edit
        WHEN 'delete' THEN permission.can_delete
        ELSE permission.can_read
      END
  );
$$;

REVOKE ALL ON FUNCTION public.crm_employee_has_access(TEXT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_employee_has_access(TEXT, BIGINT, TEXT) TO authenticated;

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('crm_companies', 'crm_companies', 'id'),
    ('crm_websites', 'crm_companies', 'company_id'),
    ('crm_website_integrations', 'crm_companies', 'company_id'),
    ('crm_contacts', 'crm_contacts', 'company_id'),
    ('crm_leads', 'crm_leads', 'company_id'),
    ('crm_contact_tags', 'crm_contacts', 'company_id'),
    ('crm_mailboxes', 'crm_webmail', 'company_id'),
    ('crm_email_threads', 'crm_webmail', 'company_id'),
    ('crm_email_messages', 'crm_webmail', 'company_id'),
    ('crm_email_attachments', 'crm_webmail', 'company_id'),
    ('crm_email_templates', 'crm_email_templates', 'company_id'),
    ('crm_segments', 'crm_segments', 'company_id'),
    ('crm_campaigns', 'crm_campaigns', 'company_id'),
    ('crm_campaign_contacts', 'crm_campaigns', 'company_id'),
    ('crm_campaign_messages', 'crm_campaigns', 'company_id'),
    ('crm_email_events', 'crm_campaigns', 'company_id'),
    ('crm_contact_timeline', 'crm_contacts', 'company_id'),
    ('crm_automations', 'crm_automations', 'company_id'),
    ('crm_automation_runs', 'crm_automations', 'company_id'),
    ('crm_audit_logs', 'crm_analytics', 'company_id')
  ) AS mapping(table_name, module_name, company_column) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.table_name || '_superadmin_access', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.table_name || '_crm_company_access', item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.crm_employee_has_access(%L, %I, %L))',
      item.table_name || '_crm_company_access', item.table_name, item.module_name, item.company_column, 'read'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.crm_employee_has_access(%L, %I, %L))',
      item.table_name || '_crm_company_insert', item.table_name, item.module_name, item.company_column, 'add'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.crm_employee_has_access(%L, %I, %L)) WITH CHECK (public.crm_employee_has_access(%L, %I, %L))',
      item.table_name || '_crm_company_update', item.table_name, item.module_name, item.company_column, 'edit', item.module_name, item.company_column, 'edit'
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.crm_employee_has_access(%L, %I, %L))',
      item.table_name || '_crm_company_delete', item.table_name, item.module_name, item.company_column, 'delete'
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS crm_orders_superadmin_access ON public.crm_orders;
DROP POLICY IF EXISTS crm_orders_crm_company_access ON public.crm_orders;
CREATE POLICY crm_orders_crm_company_access ON public.crm_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads lead
      WHERE lead.id = crm_orders.lead_id
        AND public.crm_employee_has_access('crm_orders', lead.company_id, 'read')
    )
  );

CREATE POLICY crm_orders_crm_company_insert ON public.crm_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads lead
      WHERE lead.id = crm_orders.lead_id
        AND public.crm_employee_has_access('crm_orders', lead.company_id, 'add')
    )
  );

CREATE POLICY crm_orders_crm_company_update ON public.crm_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads lead
      WHERE lead.id = crm_orders.lead_id
        AND public.crm_employee_has_access('crm_orders', lead.company_id, 'edit')
    )
  );

CREATE POLICY crm_orders_crm_company_delete ON public.crm_orders
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads lead
      WHERE lead.id = crm_orders.lead_id
        AND public.crm_employee_has_access('crm_orders', lead.company_id, 'delete')
    )
  );
