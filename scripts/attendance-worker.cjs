const intervalMs = Number(process.env.ATTENDANCE_SYNC_INTERVAL_MS || 15000);
const appUrl = process.env.ATTENDANCE_APP_URL || "http://localhost:3000";
const workerSecret = process.env.ATTENDANCE_WORKER_SECRET;

if (!workerSecret) {
  console.error("ATTENDANCE_WORKER_SECRET is required.");
  process.exit(1);
}

async function sync() {
  const startedAt = Date.now();
  console.log(`[attendance-worker] sync started ${new Date().toISOString()} -> ${appUrl}/api/attendance/sync`);
  try {
    const response = await fetch(`${appUrl}/api/attendance/sync`, {
      method: "POST",
      headers: { "x-attendance-worker-secret": workerSecret },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(`[attendance-worker] sync failed status=${response.status} elapsedMs=${Date.now() - startedAt} error=${result.error || "Sync failed"}`);
      return;
    }
    console.log(`[attendance-worker] sync completed elapsedMs=${Date.now() - startedAt} device=${result.device || "device"} ip=${result.ip || "unknown"} port=${result.port || "unknown"} logs=${result.logsFetched ?? 0}`);
  } catch (error) {
    console.error(`[attendance-worker] request failed elapsedMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : "Connection failed"}`);
  }
}

console.log(`[attendance-worker] running every ${intervalMs / 1000}s against ${appUrl}`);
sync();
setInterval(sync, intervalMs);
