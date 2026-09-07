ALTER TABLE public.attendance
  ALTER COLUMN device_log_id TYPE BIGINT USING device_log_id::bigint;

-- Existing syncs may have imported the same device punch more than once.
-- Keep the earliest database row for each identical user/timestamp pair.
DELETE FROM public.attendance duplicate_row
USING public.attendance original_row
WHERE duplicate_row.zk_user_id = original_row.zk_user_id
  AND duplicate_row.check_in = original_row.check_in
  AND duplicate_row.id > original_row.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_zk_user_check_in_key'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_zk_user_check_in_key UNIQUE (zk_user_id, check_in);
  END IF;
END $$;
