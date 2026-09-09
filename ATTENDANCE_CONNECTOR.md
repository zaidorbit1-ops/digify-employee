# Windows Attendance Connector

The connector is a standalone Node.js executable. It connects to the K60 from the office LAN and sends raw attendance over authenticated HTTPS to Vercel. Vercel writes the database; the office PC never receives a Supabase service-role key.

## Build

```powershell
npm install
npm run attendance:build
```

The executable is created at `dist\attendance-worker.exe`.

## Office PC setup

1. Copy the complete `dist` folder to the office PC.
2. Copy `dist\.env.example` to `dist\.env`.
3. Set the K60 IP/port, Vercel ingest URL, connector token, sync interval, and timezone offset in `dist\.env`.
4. Run PowerShell as Administrator, open the `dist` folder, and run `powershell -ExecutionPolicy Bypass -File .\scripts\install-attendance-task.ps1`.

The installer creates the `ZKTecoAttendanceConnector` Scheduled Task. It runs as `SYSTEM` at Windows startup, has no visible console window, and restarts after a failure.

## Operations

```powershell
Start-ScheduledTask -TaskName ZKTecoAttendanceConnector
Stop-ScheduledTask -TaskName ZKTecoAttendanceConnector
Restart-ScheduledTask -TaskName ZKTecoAttendanceConnector
Get-Content .\dist\logs\attendance-worker.log -Wait
```

Uninstall it from the copied `dist` folder with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-attendance-task.ps1
```

The packaged executable contains the Node.js runtime and dependencies. Node.js does not need to remain installed on the office PC after packaging. The `.env` file must stay beside the executable, and the Supabase service-role key must never be committed or shipped in a public repository.

## Configuration

Office `dist\.env` contains only:

```env
ZK_DEVICE_IP=192.168.18.201
ZK_DEVICE_PORT=4370
ATTENDANCE_SYNC_INTERVAL_MS=15000
ATTENDANCE_TIMEZONE_OFFSET_MINUTES=300
CONNECTOR_API_URL=https://your-vercel-domain.vercel.app/api/attendance/ingest
CONNECTOR_TOKEN=the-same-random-secret-configured-on-vercel
```

Vercel contains these server-only variables:

```env
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CONNECTOR_TOKEN=the-same-random-secret-as-the-office-pc
```

The API endpoint is:

```text
https://YOUR-VERCEL-DOMAIN/api/attendance/ingest
```