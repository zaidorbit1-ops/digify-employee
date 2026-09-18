ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_attendance_manual_override
  ON public.attendance (device_log_id)
  WHERE manual_override = TRUE;
