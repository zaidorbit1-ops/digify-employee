-- Allow a signed-in user to update only their own profile display name.
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Middleware and the employee settings view need to read only that employee's grants.
CREATE POLICY permissions_employee_read ON public.permissions
  FOR SELECT TO authenticated
  USING (employee_id IN (
    SELECT employee_id FROM public.profiles WHERE user_id = auth.uid()
  ));