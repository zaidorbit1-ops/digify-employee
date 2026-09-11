CREATE TABLE IF NOT EXISTS public.holidays (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_holidays_dates ON public.holidays(start_date, end_date);
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holidays_admin_access ON public.holidays;
CREATE POLICY holidays_admin_access ON public.holidays FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS holidays_employee_read ON public.holidays;
CREATE POLICY holidays_employee_read ON public.holidays FOR SELECT TO authenticated
  USING (true);
