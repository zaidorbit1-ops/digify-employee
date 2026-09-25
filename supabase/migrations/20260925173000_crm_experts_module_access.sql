CREATE OR REPLACE FUNCTION public.crm_employee_has_module_access(
  requested_module TEXT,
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

REVOKE ALL ON FUNCTION public.crm_employee_has_module_access(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_employee_has_module_access(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS crm_experts_superadmin_access ON public.crm_experts;
DROP POLICY IF EXISTS crm_experts_module_access ON public.crm_experts;
CREATE POLICY crm_experts_module_access ON public.crm_experts
  FOR SELECT TO authenticated
  USING (public.crm_employee_has_module_access('crm_experts', 'read'));

CREATE POLICY crm_experts_module_insert ON public.crm_experts
  FOR INSERT TO authenticated
  WITH CHECK (public.crm_employee_has_module_access('crm_experts', 'add'));

CREATE POLICY crm_experts_module_update ON public.crm_experts
  FOR UPDATE TO authenticated
  USING (public.crm_employee_has_module_access('crm_experts', 'edit'))
  WITH CHECK (public.crm_employee_has_module_access('crm_experts', 'edit'));

CREATE POLICY crm_experts_module_delete ON public.crm_experts
  FOR DELETE TO authenticated
  USING (public.crm_employee_has_module_access('crm_experts', 'delete'));
