ALTER TABLE public.salaries
  ADD COLUMN IF NOT EXISTS receipt_storage_path TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('salary-receipts', 'salary-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE INDEX IF NOT EXISTS salaries_receipt_storage_path_idx
  ON public.salaries (receipt_storage_path)
  WHERE receipt_storage_path IS NOT NULL;
