# Attendance logic fixes

Path: `app/attendance-logic-fixes.md`

Yeh **plan** hai — abhi code change nahi. Problem CRM ki shift/late logic hai. Worker is ticket pe **band** hai: usme kuch mat likho.

---

## Problem kya hai

Software mein admin employee ko **shift timing** assign karta hai (`shift_timings` + employee `shift_id`).

Example:

- Shift: **4:00 PM → 1:00 AM**
- Grace: **20 minutes**

Jo chahiye:

| Punch | Result |
| --- | --- |
| 4:20 PM se pehle pehli fingerprint | **On time / Present** |
| 4:20 PM ke baad pehli fingerprint | **Late** |
| 4:00 PM se **pehle** bhi (jaise 3:50 PM), lekin shift start se 4 ghante ke andar (12:00 PM ke baad) | **On time**, late nahi |
| Shift end ke **4 ghante baad** tak checkout (1:00 AM + 4h = 5:00 AM) | Usi shift ki checkout, session close |

**Bug abhi:** employee 4:00 PM se pehle check-in kare (3:50 PM) to app **Late** dikhati hai.

Ghalat agent ne isko theek karne ke liye **worker** change kar diya. Worker device se data uthata hai; late/present **CRM functions + database fields** se aane chahiye.

---

## Worker lock (yahan haath mat lagana)

Yeh files / cheezen **mat** badlo is fix ke liye:

- `app/scripts/attendance-worker.cjs`
- `dist/attendance-worker.exe` / `app/dist/attendance-worker.exe`
- `dist/.env` (`ZK_DEVICE_*`, `CONNECTOR_*`, interval)
- K60 TCP, poll, ingest URL, token
- `app/lib/zkteco.ts` time parse (GMT+0500 wala ingest crash alag fix hai — usay shift late logic se mat milaao)

Worker sirf yeh kare:

```text
K60 raw punches { user_id, record_time }
  -> POST /api/attendance/ingest
```

Late, on_time, session date, 4-hour window, check-in vs check-out **ingest/CRM** decide kare, worker nahi.

---

## Asli bug kahan hai

File: `app/lib/attendance.ts`

Functions:

- `officeArrivalMinutes`
- `calculatePunchFields`
- `sessionDateKey` / `sessionWindow`

Overnight shift (end < start, jaise 1:00 AM < 4:00 PM) par arrival aise nikalti hai:

```text
agar punch_clock < shift_start
    punch_minutes = punch_minutes + 24 hours

on_time = punch_minutes <= start + grace
warna late
```

3:50 PM check-in, start 4:00 PM, grace 20:

1. 15:50 = 950 minutes
2. Start 16:00 = 960
3. 950 < 960 → wrap → 950 + 1440 = **2390**
4. Grace limit = 960 + 20 = **980**
5. 2390 <= 980? **Nahi → Late**

Yahi bug hai. Pehle aana “agle din subah” ban jata hai, isliye late.

Ingest `calculatePunchFields` chala kar `attendance.arrival_status` save karta hai. Dashboard `buildAttendanceDays` se bhi yahi helpers use karti hai. **Ek hi file** theek karo: `lib/attendance.ts`. Formula ingest/UI/salary mein copy-paste mat karo.

---

## Desired session window (har shift)

Constants (CRM only):

```text
SESSION_LEAD_MINUTES = 4 * 60   // start se 4 ghante pehle
SESSION_TAIL_MINUTES = 4 * 60   // end ke 4 ghante baad
```

Session date **D** (jis din shift **start** hoti hai), example 4 PM–1 AM:

```text
window_start = D 12:00 PM
shift_start  = D  4:00 PM
grace_end    = D  4:20 PM
shift_end    = D+1 1:00 AM
window_end   = D+1 5:00 AM
```

Day shift 9:00–18:00, grace 15:

```text
window_start = D  5:00 AM
shift_start  = D  9:00 AM
grace_end    = D  9:15 AM
shift_end    = D  6:00 PM
window_end   = D 10:00 PM
```

---

## Kaise fix karna hai (steps)

### Step 1 — UTC helpers, clock wrap hatao

`officeArrivalMinutes` se yeh line **hatao / arrival ke liye use mat karo**:

```text
if (overnight && minutes < start) minutes += 24 * 60
```

Jagah iski: punch aur shift start/end ko **UTC timestamps** banao (`officeDateTimeToUtc` pehle se maujood hai), phir compare karo.

```text
on_time =
  checkInUtc >= shiftStartUtc - 4 hours
  && checkInUtc <= shiftStartUtc + grace_minutes

late =
  checkInUtc > shiftStartUtc + grace_minutes
  && checkInUtc <= windowEndUtc
```

Early check-in (3:50 PM) start se choti timestamp hai, wrap nahi, `<= start+grace` true → **on_time**.

### Step 2 — `sessionWindow` / `sessionDateKey` 4-hour rule par lao

Ab overnight midpoint `(start+end)/2` (~8:30 AM is shift par) use hoti hai. Yeh product rule nahi.

Naya:

- Session D ki window: `[shiftStart - 4h, shiftEnd + 4h)`
- Overnight: `shiftEnd` next calendar day
- `sessionDateKey(punch, shift)`: punch is window mein gire to D return karo
- Window se bahar: is employee ki is shift ki punch nahi (ignore / agli D)

Checkout 1:10 AM aur 4:50 AM dono D wali raat ki window mein rehte hain. 6:00 AM window se bahar.

### Step 3 — `calculatePunchFields`

Pehle se: session ki unique punches (60s duplicate skip), pehli = check-in, doosri = check-out.

Change sirf arrival:

1. `first` punch UTC
2. Us session ka `shiftStartUtc` + grace
3. Lead window ke andar aur grace ke andar → `on_time`
4. Grace ke baad, window ke andar → `late`

`day_status` / hours / half_day (<= 5 hours) **abhi mat badlo** jab tak product na kahe.

Doosri punch `window_end` tak `session_end` set kare. Us ke baad ki punch is session mein checkout na bane.

### Step 4 — Ingest thin rakho

`app/app/api/attendance/ingest/route.ts`:

- Naya late formula yahan **mat** likho
- Woh `sessionDateKey` + `calculatePunchFields` import karta rahe
- Optional: existing punches load window ko 36h ki jagah `lead+shift+tail` jitna rakho taake 12 PM early punch aur 5 AM checkout mil jayein

Worker payload same: `{ device_ip, port, records: [{ user_id, record_time }] }`.

### Step 5 — Tests (bina device / bina worker)

`lib/attendance.ts` ke against, shift 16:00–01:00 grace 20:

| Office time | Expected |
| --- | --- |
| 12:00 PM first punch | on_time, session D |
| **3:50 PM first punch** | **on_time** (bug fix) |
| 4:10 PM first | on_time |
| 4:21 PM first | late |
| 3:50 PM in + 12:50 AM out | on_time, same session checkout |
| 3:50 PM in + 4:50 AM out | same session checkout |
| 3:50 PM in + 6:00 AM out | checkout is session se nahi |
| 11:00 AM first | is session se nahi |

Day shift 09:00–18:00 grace 15: 8:50 → on_time; 9:16 → late.

### Step 6 — Deploy (worker nahi)

1. `lib/attendance.ts` (+ optional ingest fetch window) Vercel pe deploy
2. Worker exe **rebuild/restart mat** karo is ticket ke liye
3. Attendance page pe 3:50 PM → On time
4. Salary late-count khud theek hona chahiye kyunke woh `arrival_status === "late"` use karti hai

Purani DB rows galat `late` save ho sakti hain. UI `buildAttendanceDays` punches se dobara nikalta hai. Agli ingest upsert stored columns update kar degi. Alag SQL migration is rule ke liye zaroori nahi.

---

## Files

**Change:**

- `app/lib/attendance.ts` — almost saara kaam
- `app/app/api/attendance/ingest/route.ts` — sirf fetch range, agar chahiye
- attendance helper tests

**UI/API jo khud theek ho jayenge** (formula duplicate mat karna):

- `app/app/api/attendance/route.ts`
- `app/app/api/salaries/route.ts`
- `app/app/api/me/attendance/route.ts`
- `app/components/attendance/attendance-notifier.tsx`
- dashboard attendance pages

**Do not touch:** worker, dist env, device TCP, `zkteco.ts` parse.

---

## Success

- 3:50 PM + 4:00 PM start + 20 grace → **On time**
- 4:21 PM → **Late**
- 12:05 PM → **On time**, usi shift
- 1:10 AM / 4:50 AM checkout → usi raat ki shift close
- Worker log mein naya ingest 500 nahi (yeh logic ticket worker se related nahi)
