-- device_log_id is a derived hash, not a device serial.
-- Its UNIQUE constraint makes full ingest upserts fail with 500
-- when two punches hash to the same value.
ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_device_log_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_zk_user_check_in_key'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_zk_user_check_in_key UNIQUE (zk_user_id, check_in);
  END IF;
END $$;
