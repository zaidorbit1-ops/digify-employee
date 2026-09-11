ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS actual_late_days INT NOT NULL DEFAULT 0 CHECK (actual_late_days >= 0),
  ADD COLUMN IF NOT EXISTS actual_absent_days INT NOT NULL DEFAULT 0 CHECK (actual_absent_days >= 0),
  ADD COLUMN IF NOT EXISTS actual_half_days INT NOT NULL DEFAULT 0 CHECK (actual_half_days >= 0);

UPDATE public.salaries
SET actual_late_days = late_days,
    actual_absent_days = absent_days,
    actual_half_days = half_days
WHERE actual_late_days = 0
  AND actual_absent_days = 0
  AND actual_half_days = 0
  AND (late_days > 0 OR absent_days > 0 OR half_days > 0);
