CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  device_ip VARCHAR(45) NOT NULL,
  port INT NOT NULL DEFAULT 4370,
  device_type VARCHAR(50) DEFAULT 'zkteco_k60',
  status VARCHAR(30) DEFAULT 'active',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(30),
  position VARCHAR(100),
  salary NUMERIC(12,2),
  device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  zk_device_uid INT UNIQUE,
  enrollment_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  zk_user_id INT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'present',
  device_log_id INT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zkteco_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  sync_time TIMESTAMPTZ DEFAULT NOW(),
  device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL,
  total_records INT,
  new_records INT,
  status VARCHAR(50),
  error_message TEXT
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS device_id BIGINT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS zk_device_uid INT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS enrollment_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS employee_id BIGINT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_id BIGINT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'present';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_log_id INT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE zkteco_sync_logs ADD COLUMN IF NOT EXISTS device_id BIGINT;
ALTER TABLE zkteco_sync_logs ADD COLUMN IF NOT EXISTS total_records INT;
ALTER TABLE zkteco_sync_logs ADD COLUMN IF NOT EXISTS new_records INT;
ALTER TABLE zkteco_sync_logs ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE zkteco_sync_logs ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(device_ip);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_device_id ON employees(device_id);
CREATE INDEX IF NOT EXISTS idx_employees_zk_device_uid ON employees(zk_device_uid);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_device_id ON attendance(device_id);
CREATE INDEX IF NOT EXISTS idx_attendance_check_in ON attendance(check_in);
CREATE INDEX IF NOT EXISTS idx_attendance_zk_user_id ON attendance(zk_user_id);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE zkteco_sync_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'devices'
      AND policyname = 'devices_select_policy'
  ) THEN
    CREATE POLICY devices_select_policy
      ON devices FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'devices'
      AND policyname = 'devices_insert_policy'
  ) THEN
    CREATE POLICY devices_insert_policy
      ON devices FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'employees_select_policy'
  ) THEN
    CREATE POLICY employees_select_policy
      ON employees FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'employees_insert_policy'
  ) THEN
    CREATE POLICY employees_insert_policy
      ON employees FOR INSERT
      TO anon, authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'devices'
      AND policyname = 'devices_all_policy'
  ) THEN
    CREATE POLICY devices_all_policy
      ON devices FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'employees_all_policy'
  ) THEN
    CREATE POLICY employees_all_policy
      ON employees FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'attendance'
      AND policyname = 'attendance_all_policy'
  ) THEN
    CREATE POLICY attendance_all_policy
      ON attendance FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zkteco_sync_logs'
      AND policyname = 'zkteco_sync_logs_all_policy'
  ) THEN
    CREATE POLICY zkteco_sync_logs_all_policy
      ON zkteco_sync_logs FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
