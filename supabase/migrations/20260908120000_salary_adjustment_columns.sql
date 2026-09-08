ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS custom_deduction_amount NUMERIC(12,2)
    CHECK (custom_deduction_amount IS NULL OR custom_deduction_amount >= 0);

ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS adjustment_note TEXT;