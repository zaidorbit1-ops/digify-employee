process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES = "300";
const { sessionDateKey, calculatePunchFields, sessionWindow } = await import(
  "../lib/attendance.ts"
);

const shift = {
  start_time: "16:00:00",
  end_time: "01:00:00",
  grace_minutes: 20,
};
const D = "2026-09-12";
const punch = (iso) => ({ zk_user_id: 2, check_in: iso });
let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}

const early = "2026-09-12T10:50:00.000Z";
const ontime = "2026-09-12T11:10:00.000Z";
const late = "2026-09-12T11:21:00.000Z";
const noon = "2026-09-12T07:00:00.000Z";
const outNight = "2026-09-12T19:50:00.000Z";
const outTail = "2026-09-12T23:50:00.000Z";
const outAfter = "2026-09-13T01:00:00.000Z";
const tooEarly = "2026-09-12T06:00:00.000Z";

check("session 3:50", sessionDateKey(early, shift) === D);
check("session 12:00", sessionDateKey(noon, shift) === D);
check("session 11:00 empty", sessionDateKey(tooEarly, shift) === "");
check("session 4:50am", sessionDateKey(outTail, shift) === D);
check("session 6am empty", sessionDateKey(outAfter, shift) === "");
check(
  "3:50 on_time",
  calculatePunchFields([punch(early)], shift)?.arrival_status === "on_time",
);
check(
  "4:10 on_time",
  calculatePunchFields([punch(ontime)], shift)?.arrival_status === "on_time",
);
check(
  "4:21 late",
  calculatePunchFields([punch(late)], shift)?.arrival_status === "late",
);
check(
  "12:00 on_time",
  calculatePunchFields([punch(noon)], shift)?.arrival_status === "on_time",
);
const pair = calculatePunchFields([punch(early), punch(outNight)], shift);
check(
  "checkout 12:50am",
  pair?.session_end === outNight && pair?.arrival_status === "on_time",
);
check(
  "checkout 4:50am",
  calculatePunchFields([punch(early), punch(outTail)], shift)?.session_end ===
    outTail,
);
check(
  "6am not checkout",
  calculatePunchFields([punch(early), punch(outAfter)], shift)?.session_end ==
    null,
);
const day = { start_time: "09:00:00", end_time: "18:00:00", grace_minutes: 15 };
check(
  "day 8:50 on_time",
  calculatePunchFields([punch("2026-09-12T03:50:00.000Z")], day)
    ?.arrival_status === "on_time",
);
check(
  "day 9:16 late",
  calculatePunchFields([punch("2026-09-12T04:16:00.000Z")], day)
    ?.arrival_status === "late",
);
const w = sessionWindow(D, shift);
check("window start 12pm", w.start === "2026-09-12T07:00:00.000Z");
check("window end 5am", w.end === "2026-09-13T00:00:00.000Z");

if (failed) process.exit(1);
