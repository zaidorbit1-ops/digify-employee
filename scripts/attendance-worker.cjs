const fs = require("node:fs");
const path = require("node:path");
const Zkteco = require("zkteco-js");

const workerDirectory = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(path.join(workerDirectory, ".env"));
if (!process.pkg) loadEnvFile(path.join(workerDirectory, ".env.local"));

const intervalMs = Number(process.env.ATTENDANCE_SYNC_INTERVAL_MS || 15000);
const deviceIp = process.env.ZK_DEVICE_IP;
const devicePort = Number(process.env.ZK_DEVICE_PORT || 4370);
const connectorApiUrl = process.env.CONNECTOR_API_URL;
const connectorCommandsUrl = process.env.CONNECTOR_COMMANDS_URL || (connectorApiUrl ? connectorApiUrl.replace(/\/ingest\/?$/, "/commands") : "");
const connectorToken = process.env.CONNECTOR_TOKEN;
const logDirectory = path.join(workerDirectory, "logs");
const logPath = path.join(logDirectory, "attendance-worker.log");
const maxLogBytes = 5 * 1024 * 1024;
let shuttingDown = false;
let deviceWasConnected = false;
let lastSyncError = "";
let lastCommandError = "";
let previousPunches = new Set();

fs.mkdirSync(logDirectory, { recursive: true });

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(logPath) && fs.statSync(logPath).size >= maxLogBytes) fs.renameSync(logPath, `${logPath}.1`);
  } catch {
  }
}

function writeLog(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}`;
  rotateLogIfNeeded();
  fs.appendFileSync(logPath, `${line}\n`);
  process.stdout.write(`${line}\n`);
}

function errorDetails(error) {
  if (error instanceof Error) return error.message;
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return serialized;
    return String(error?.message || error);
  } catch { return String(error); }
}

function writeErrorOnce(scope, error) {
  const message = errorDetails(error);
  if (scope === "sync" && message === lastSyncError) return;
  if (scope === "commands" && message === lastCommandError) return;
  if (scope === "sync") lastSyncError = message;
  if (scope === "commands") lastCommandError = message;
  writeLog("ERROR", `${scope} failed; retrying in ${intervalMs}ms; error=${message}`);
}

function punchKey(record) {
  return `${record.user_id}:${new Date(String(record.record_time)).toISOString()}`;
}

if (!deviceIp || !connectorApiUrl || !connectorCommandsUrl || !connectorToken) {
  writeLog("ERROR", "ZK_DEVICE_IP, CONNECTOR_API_URL, CONNECTOR_COMMANDS_URL, and CONNECTOR_TOKEN are required.");
  process.exit(1);
}

async function sync() {
  let device;
  let connected = false;
  try {
    device = new Zkteco(deviceIp, devicePort, 5000, 5000, 65472);
    await device.createSocket();
    connected = true;
    if (!deviceWasConnected) writeLog("INFO", `K60 connected at ${deviceIp}:${devicePort}`);
    deviceWasConnected = true;

    const attendanceResponse = await device.getAttendances();
    const records = attendanceResponse?.data || [];
    const response = await fetch(connectorApiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-connector-token": connectorToken },
      body: JSON.stringify({ device_ip: deviceIp, port: devicePort, records }),
      signal: AbortSignal.timeout(Math.max(10000, intervalMs - 1000)),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Ingest API ${response.status}: ${result.error || "request failed"}`);

    const currentPunches = new Set(records.map(punchKey));
    if (!previousPunches.size) {
      writeLog("INFO", `Attendance baseline loaded; records=${records.length}`);
    } else {
      records.filter((record) => !previousPunches.has(punchKey(record))).forEach((record) => {
        writeLog("INFO", `Attendance recorded; uid=${record.user_id}; time=${new Date(String(record.record_time)).toISOString()}`);
      });
    }
    previousPunches = currentPunches;
    lastSyncError = "";
  } catch (error) {
    if (deviceWasConnected) writeLog("WARN", `K60 connection lost at ${deviceIp}:${devicePort}`);
    deviceWasConnected = false;
    writeErrorOnce("sync", error);
  } finally {
    if (device && connected) await device.disconnect().catch((error) => writeLog("WARN", `K60 disconnect failed: ${errorDetails(error)}`));
  }
}

async function processEnrollmentCommands() {
  const response = await fetch(connectorCommandsUrl, {
    headers: { "x-connector-token": connectorToken },
    signal: AbortSignal.timeout(Math.max(10000, intervalMs - 1000)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Command API ${response.status}: ${result.error || "request failed"}`);
  lastCommandError = "";

  for (const command of result.commands ?? []) {
    let device;
    try {
      const claimResponse = await fetch(`${connectorCommandsUrl}/${command.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-connector-token": connectorToken },
        body: JSON.stringify({ action: "claim" }),
        signal: AbortSignal.timeout(10000),
      });
      if (!claimResponse.ok) continue;
      const claimed = await claimResponse.json();
      if (!claimed.claimed) continue;

      const payload = command.payload;
      device = new Zkteco(payload.device_ip, Number(payload.port), 5000, 5000, 65472);
      await device.createSocket();
      await device.setUser(Number(payload.uid), String(payload.uid), String(payload.name), "", 0, "");
      const completeResponse = await fetch(`${connectorCommandsUrl}/${command.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-connector-token": connectorToken },
        body: JSON.stringify({ action: "complete", result: { uid: Number(payload.uid), userId: String(payload.uid), name: String(payload.name) } }),
        signal: AbortSignal.timeout(10000),
      });
      if (!completeResponse.ok) throw new Error(`Command completion failed with status ${completeResponse.status}`);
      writeLog("INFO", `Enrollment completed; commandId=${command.id}; uid=${payload.uid}; name=${payload.name}`);
    } catch (error) {
      writeLog("ERROR", `Enrollment failed; commandId=${command.id}; error=${errorDetails(error)}`);
      await fetch(`${connectorCommandsUrl}/${command.id}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-connector-token": connectorToken },
        body: JSON.stringify({ action: "fail", error: errorDetails(error) }),
      }).catch(() => undefined);
    } finally {
      if (device) await device.disconnect().catch(() => undefined);
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  writeLog("INFO", `Worker shutdown requested (${signal})`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

writeLog("INFO", `Worker started; intervalMs=${intervalMs}; device=${deviceIp}:${devicePort}; api=${connectorApiUrl}`);

async function runForever() {
  while (!shuttingDown) {
    await sync();
    await processEnrollmentCommands().catch((error) => writeErrorOnce("commands", error));
    if (!shuttingDown) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

if (process.env.ATTENDANCE_ONCE === "1") {
  sync()
    .then(() => processEnrollmentCommands())
    .catch((error) => writeErrorOnce("commands", error))
    .then(() => { process.exitCode = 0; });
} else {
  runForever().catch((error) => {
    writeLog("ERROR", `Worker loop failed: ${errorDetails(error)}`);
    process.exitCode = 1;
  });
}
