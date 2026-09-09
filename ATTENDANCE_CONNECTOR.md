# ZKTeco K60 Attendance Connector

## Purpose

This connector keeps the ZKTeco K60 on the private office LAN while the CRM remains deployed on Vercel.

The final architecture is:

```text
K60 (192.168.18.201:4370)
        |
        | local TCP connection
        v
attendance-worker.exe on office PC
        |
        | authenticated HTTPS
        v
Vercel Next.js /api/attendance/ingest
        |
        | server-side Supabase client
        v
Supabase attendance table
        |
        v
Vercel CRM attendance pages and realtime notifications
```

Vercel never tries to connect to `192.168.18.201`. The office PC never receives the Supabase service-role key.

## What Was Implemented

### 1. Existing ZKTeco integration preserved

The project continues to use the working `zkteco-js` package. The K60 connection is created with the existing TCP settings:

```js
new Zkteco(ip, port, 5000, 5000, 65472)
await device.createSocket()
```

The worker calls:

```js
await device.getAttendances()
```

No Python rewrite, ADMS, port forwarding, or public K60 port was added.

### 2. Worker moved to HTTPS-only delivery

The worker still connects to the K60 locally, but it no longer imports Supabase and no longer reads `SUPABASE_SERVICE_ROLE_KEY`.

For every polling cycle it:

1. Connects to the K60.
2. Fetches attendance logs.
3. Sends the raw `user_id` and `record_time` values to the Vercel ingest endpoint.
4. Authenticates with `x-connector-token`.
5. Logs the API response.
6. Disconnects from the K60.
7. Waits 15 seconds and repeats.

The worker retries naturally because every failed cycle is logged and the loop continues.

### 2.1 Enrollment command flow

Enrollment does not use a direct Vercel-to-device connection anymore:

```text
CRM enrollment request
        -> Vercel creates a pending device_commands row
        -> office worker polls /api/attendance/commands
        -> worker claims the command
        -> worker connects locally to K60
        -> worker executes device.setUser(...)
        -> worker reports success/failure to Vercel
        -> Vercel updates employee enrollment_status
```

The `device_commands` table stores command status as `pending`, `processing`, `succeeded`, or `failed`. The enrollment idempotency key prevents duplicate active enrollment commands for the same employee, device, and ZKTeco UID. A completed command can be safely requested again for re-enrollment.

The worker serializes attendance polling and enrollment execution, so it does not open competing K60 connections at the same time. If the office PC, network, or K60 is temporarily unavailable, the command remains recoverable in the queue and the worker retries on its next cycle.

### 3. Secure server-side ingest endpoint

The new route is:

```text
https://YOUR-VERCEL-DOMAIN/api/attendance/ingest
```

File:

```text
app/api/attendance/ingest/route.ts
```

It performs these checks and operations:

1. Reads `x-connector-token` from the request.
2. Compares it with Vercel's server-only `CONNECTOR_TOKEN` using a timing-safe comparison.
3. Returns `401` for missing or invalid authentication.
4. Parses and validates `device_ip`, `port`, and `records`.
5. Returns `400` for malformed payloads.
6. Loads devices, employees, and shifts using the server Supabase client.
7. Normalizes timestamps with the existing `normalizeAttendanceRecord` helper.
8. Maps K60 `user_id` values to `employees.zk_device_uid`.
9. Calculates arrival status, late status, session start/end, worked minutes, and hours.
10. Upserts through the existing database helper.
11. Preserves the duplicate conflict key:

```text
zk_user_id,check_in
```

12. Returns a JSON result containing received and synced counts.

Only this server route uses `SUPABASE_SERVICE_ROLE_KEY` for connector ingestion.

Enrollment command routes are:

```text
GET  /api/attendance/commands
POST /api/attendance/commands/:id
```

They require the same `x-connector-token`. The browser enrollment route only creates/waits for the queued command; it never imports or calls the ZKTeco client.

### 4. Middleware exception

The connector endpoint is allowed through the normal browser-auth middleware only so that the route can perform its own connector-token authentication. All other API routes remain protected by the existing user session and permission checks.

### 5. Standalone executable

The worker is packaged with `@yao-pkg/pkg` into:

```text
dist\attendance-worker.exe
```

The executable contains the Node.js runtime and required packages, including `zkteco-js`. Node.js and Python are not required on the office PC after packaging.

The executable reads `.env` from the same folder as the executable. Logs are written beside it:

```text
dist\
  attendance-worker.exe
  .env
  logs\attendance-worker.log
  scripts\
```

Logs rotate when the active log reaches approximately 5 MB.

### 6. Automatic Windows startup

The installer creates a Windows Scheduled Task named:

```text
ZKTecoAttendanceConnector
```

The task:

- Runs at Windows startup.
- Runs as `SYSTEM`.
- Has no visible CMD window.
- Starts without an interactive user login.
- Restarts after a process failure.
- Uses the `dist` folder as its working directory.

## Environment Variables

### Office PC: `dist\.env`

The office PC must contain only these values:

```env
ZK_DEVICE_IP=192.168.18.201
ZK_DEVICE_PORT=4370
ATTENDANCE_SYNC_INTERVAL_MS=15000
ATTENDANCE_TIMEZONE_OFFSET_MINUTES=300
CONNECTOR_API_URL=https://your-vercel-domain.vercel.app/api/attendance/ingest
CONNECTOR_COMMANDS_URL=https://your-vercel-domain.vercel.app/api/attendance/commands
CONNECTOR_TOKEN=the-same-long-random-secret-configured-on-vercel
```

The office PC must NOT contain:

```env
SUPABASE_SERVICE_ROLE_KEY=...
```

It also does not need `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the connector.

### Vercel: server-only variables

Add these in Vercel Project Settings > Environment Variables:

```env
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CONNECTOR_TOKEN=the-same-long-random-secret-as-office-pc
```

Use the variables for Production, and Preview only if you intentionally test the connector against a Preview deployment. Do not use `NEXT_PUBLIC_` for either secret.

After changing Vercel variables, redeploy the application.

Generate a strong connector token, for example with PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

The same token must be placed in Vercel and the office PC `.env`. Do not commit it to GitHub.

## Build Process

Run these commands in the project folder:

```powershell
npm install
npm run attendance:build
```

The build script:

```text
scripts\build-attendance-exe.ps1
```

It packages `scripts\attendance-worker.cjs`, creates `dist\attendance-worker.exe`, copies `.env.example` to `dist\.env.example`, and copies the install/uninstall task scripts into `dist\scripts`.

The source project requires Node.js only to build the executable. The office PC does not need Node.js after the EXE is created.

## First Office PC Installation

1. Deploy the latest Next.js code to Vercel.
2. Add `SUPABASE_SERVICE_ROLE_KEY` and `CONNECTOR_TOKEN` to Vercel.
3. Redeploy Vercel.
4. Build the connector:

```powershell
npm install
npm run attendance:build
```

5. Copy the complete `dist` folder to the office PC.
6. In the copied folder, create `.env` from `.env.example`:

```powershell
Copy-Item .env.example .env
```

7. Edit `.env` and enter the real K60 IP, Vercel endpoint, and connector token.
8. Confirm the office PC is on the same LAN as the K60.
9. Confirm the device is reachable at `192.168.18.201:4370`.
10. Open PowerShell as Administrator inside the copied `dist` folder.
11. Install and start the task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-attendance-task.ps1
```

12. Confirm the task status:

```powershell
Get-ScheduledTask -TaskName ZKTecoAttendanceConnector
```

## Normal Future Run Procedure

After the initial installation, no manual Node.js command is needed. Windows starts the connector automatically after reboot.

To manually start it:

```powershell
Start-ScheduledTask -TaskName ZKTecoAttendanceConnector
```

To stop it:

```powershell
Stop-ScheduledTask -TaskName ZKTecoAttendanceConnector
```

To restart it after changing `.env` or replacing the EXE:

```powershell
Stop-ScheduledTask -TaskName ZKTecoAttendanceConnector
Start-ScheduledTask -TaskName ZKTecoAttendanceConnector
```

To view live logs from the `dist` folder:

```powershell
Get-Content .\logs\attendance-worker.log -Wait
```

To uninstall the task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-attendance-task.ps1
```

## Updating the Connector

When the worker code changes:

1. Run `npm run attendance:build` in the source project.
2. Stop the office task.
3. Replace `attendance-worker.exe` in the office `dist` folder.
4. Keep the existing office `.env` file.
5. Start the task again.

```powershell
Stop-ScheduledTask -TaskName ZKTecoAttendanceConnector
# Replace attendance-worker.exe here
Start-ScheduledTask -TaskName ZKTecoAttendanceConnector
```

When only the connector token changes:

1. Update `CONNECTOR_TOKEN` in Vercel.
2. Redeploy Vercel.
3. Update `CONNECTOR_TOKEN` in office `dist\.env`.
4. Restart the Scheduled Task.

## Logs and Expected Messages

Successful log entries look similar to:

```text
Worker started; intervalMs=15000; device=192.168.18.201:4370
Polling K60 at 192.168.18.201:4370
K60 connected
Attendance sync completed; fetched=5, synced=5
```

Common failures:

```text
ETIMEDOUT
```

Usually means the office PC cannot reach the K60. Check power, LAN, IP, and port `4370`.

```text
Ingest API 401
```

The office `CONNECTOR_TOKEN` does not match Vercel's `CONNECTOR_TOKEN`, or Vercel was not redeployed after changing it.

```text
Ingest API 400
```

The payload was rejected by the server validation. Use the latest EXE and do not manually alter the worker payload.

```text
Ingest API 500
```

The Vercel route reached the server but Supabase processing failed. Check Vercel function logs and the server-side Supabase variables.

A temporary internet outage causes API errors but does not permanently stop the worker. The next polling cycle retries the HTTPS request. A temporary K60 outage is handled the same way.

## Security Rules

- Never put `SUPABASE_SERVICE_ROLE_KEY` in the office `.env`.
- Never use `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- Never commit `.env`, connector tokens, or service keys.
- Never expose K60 port `4370` publicly.
- Never put the connector token in browser/client code.
- Rotate the Supabase service key and connector token if they are exposed.
- Keep `dist\.env` readable only by the connector administrator where possible.

## Testing Checklist

After deployment and office installation, test:

1. K60 TCP connection succeeds from the office PC.
2. The worker fetches attendance logs.
3. The worker sends HTTPS to the Vercel ingest URL.
4. A valid token returns a successful JSON response.
5. An invalid token returns `401`.
6. A malformed payload returns `400`.
7. Supabase receives/upserts attendance rows.
8. Running the worker repeatedly does not create duplicate `(zk_user_id, check_in)` rows.
9. The CRM attendance page displays the saved data.
10. Internet interruption is logged and later recovered automatically.
11. K60/network interruption is logged and later recovered automatically.
12. Windows reboot starts the Scheduled Task automatically.
13. The packaged EXE works on a machine without Node.js and Python installed.

The final connector design confirms that `SUPABASE_SERVICE_ROLE_KEY` is not required on the office PC.
