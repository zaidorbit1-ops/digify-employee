# 📋 EMPLOYEE MANAGEMENT SYSTEM - COMPLETE OVERVIEW
## ZKTeco K60 + Supabase + NextJS

---

## 🎯 WORKFLOW (Simplest Version)

```
STAGE 1: Add Employee to Database
         Admin → Form fill karo
         ├─ Name: Ali
         ├─ Email: ali@example.com
         ├─ Phone: 0300123456
         └─ Database mein save → Gets ID (E001)

STAGE 2: Add Employee to K60 Device
         Admin → "Add to ZKTeco" button click
         ├─ K60 device ko call karo
         ├─ Employee ko register karo (UID: 1)
         ├─ Device par user add ho gaya
         └─ Ab device ready (thumbprint lene ke liye)

STAGE 3: Employee Fingerprint Enroll (3x)
         Employee → K60 device ke paas jaye
         ├─ Thumb 1 lagaye → K60 par record ho
         ├─ Thumb 2 lagaye → K60 par record ho
         ├─ Thumb 3 lagaye → K60 par record ho (complete enrollment)
         └─ K60 ne employee ko recognize kar liya

STAGE 4: Attendance Marking (Daily)
         Employee → Office mein aaye
         ├─ K60 device par thumb lagaye
         ├─ Device attendance log mein save ho
         └─ NextJS real-time ye log fetch kare

STAGE 5: Attendance In Database
         NextJS Backend → K60 se data lao
         ├─ Latest attendance records lao
         ├─ Supabase mein save karo
         └─ Frontend par show karo

STAGE 6: Show in Dashboard
         NextJS Frontend → Attendance Display
         ├─ "Ali ne aaj attendance mark kiya"
         ├─ Time: 9:15 AM
         ├─ Status: Present
         └─ Frontend refresh → real-time update
```

---

## 📊 SUPABASE DATABASE SCHEMA

### **Table 1: Employees**
```sql
CREATE TABLE employees (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  employee_id VARCHAR(10) UNIQUE NOT NULL,  -- E001, E002
  name VARCHAR(255) NOT NULL,               -- Ali
  email VARCHAR(255) NOT NULL,              -- ali@example.com
  phone VARCHAR(20) NOT NULL,               -- 0300123456
  position VARCHAR(100),                    -- Manager, Developer
  salary DECIMAL(10, 2),                    -- 50000.00
  zk_device_uid INT,                        -- ZKTeco device mein UID (1, 2, 3, etc)
  enrollment_status VARCHAR(50) DEFAULT 'pending',  -- pending, enrolled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example:
-- id: 1, employee_id: E001, name: Ali, zk_device_uid: 1, enrollment_status: enrolled
-- id: 2, employee_id: E002, name: Sara, zk_device_uid: 2, enrollment_status: enrolled
```

### **Table 2: Attendance**
```sql
CREATE TABLE attendance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  zk_user_id INT NOT NULL,                  -- K60 device user ID
  check_in TIMESTAMP NOT NULL,              -- 2026-09-05 09:15:30
  status VARCHAR(50) DEFAULT 'present',     -- present, late, absent
  device_log_id INT,                        -- K60 device internal log ID
  created_at TIMESTAMP DEFAULT NOW()
);

-- Example:
-- id: 1, employee_id: 1 (Ali), zk_user_id: 1, check_in: 2026-09-05 09:15:30, status: present
-- id: 2, employee_id: 2 (Sara), zk_user_id: 2, check_in: 2026-09-05 09:30:15, status: present
```

### **Table 3: ZKTeco Logs (Optional - for tracking)**
```sql
CREATE TABLE zkteco_sync_logs (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sync_time TIMESTAMP DEFAULT NOW(),
  total_records INT,
  new_records INT,
  status VARCHAR(50),  -- success, failed
  error_message TEXT
);
```

---

## 🔌 ZKTECO K60 DEVICE - HOW IT WORKS

### **Device Specifications (K60)**
```
Device Type: ZKTeco K60 Fingerprint Attendance Terminal
Connection: TCP/IP (Network based)
Port: 4370 (Default)
Protocol: ZKTeco proprietary protocol
Local Network: Same office LAN (192.168.x.x)

Device Functions:
1. Register User (Add employee fingerprint)
2. Get Users (List all enrolled employees)
3. Get Attendance Logs (Fetch attendance records)
4. Real-Time Events (Listen for live attendance)
```

### **K60 Communication Flow**

```
┌─────────────────────────────────────┐
│     NextJS Backend (Node.js)        │
│  (Admin Laptop / Server)            │
└──────────────────┬──────────────────┘
                   │
                   │ TCP/IP Connection
                   │ Port 4370
                   │ (zkteco-js library)
                   ↓
        ┌──────────────────────┐
        │  ZKTeco K60 Device   │
        │  192.168.x.5:4370    │
        │                      │
        │  - User Database     │
        │  - Fingerprint       │
        │  - Attendance Logs   │
        └──────────────────────┘

Commands:
1. createSocket()           → Connect to device
2. setUser(uid, name)       → Add employee
3. getAttendances()         → Fetch all logs
4. getRealTimeLogs()        → Listen live events
5. disconnect()             → Close connection
```

---

## 🛠️ TECHNICAL STACK

```
Frontend: NextJS (React)
Backend: NextJS API Routes (Node.js)
Database: Supabase (PostgreSQL)
ZKTeco Library: zkteco-js (npm package)
Real-time: Polling every 30 seconds OR Real-time events
Hosting: Vercel (NextJS) + Supabase (Database)
```

---

## 📱 NEXTJS + ZKTECO CONNECTION

### **Library to Use: `zkteco-js`**

```bash
npm install zkteco-js
```

### **How NextJS Connects with K60**

```
USER CLICKS "SYNC ATTENDANCE" BUTTON
         ↓
   NextJS Frontend
         ↓
   POST /api/attendance/sync
         ↓
   NextJS API Route (Node.js)
         ↓
   Import { Zkteco } from 'zkteco-js'
         ↓
   new Zkteco('192.168.x.5', 4370)
         ↓
   await device.createSocket()
         ↓
   await device.getAttendances()
         ↓
   Loop through logs
         ↓
   Match with Employee (via zk_user_id)
         ↓
   Insert into Supabase
         ↓
   Return response to frontend
         ↓
   Frontend shows "Ali marked attendance at 9:15 AM"
```

### **Real-time vs Polling**

```
OPTION 1: Polling (Easier)
├─ Every 30 seconds
├─ NextJS calls: GET /api/attendance/latest
├─ Fetch from K60
├─ Store in Supabase
└─ Show in frontend

OPTION 2: Real-time Events (Advanced)
├─ Keep socket connection open
├─ Listen for device events
├─ Instant notification
├─ Needs background job
└─ More complex

🎯 For now: Use POLLING (30 sec intervals)
```

---

## 🎬 STAGE-BY-STAGE SETUP

### **STAGE 1: Supabase Setup (5 min)**

```
1. Go to supabase.com
2. Create account
3. New project → name: "hr_system"
4. Wait for project to initialize

5. Go to SQL Editor
6. Run these queries:

-- Table 1: Employees
CREATE TABLE employees (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  employee_id VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  position VARCHAR(100),
  salary DECIMAL(10, 2),
  zk_device_uid INT,
  enrollment_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table 2: Attendance
CREATE TABLE attendance (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  zk_user_id INT NOT NULL,
  check_in TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'present',
  device_log_id INT,
  created_at TIMESTAMP DEFAULT NOW()
);

7. Copy Connection String
   Settings → Database → Connection string → URI
   Keep it safe! (For .env file)
```

---

### **STAGE 2: NextJS Project Setup (10 min)**

```bash
# Create NextJS project
npx create-next-app@latest hr_system --typescript --tailwind

cd hr_system

# Install required packages
npm install zkteco-js
npm install @supabase/supabase-js
npm install axios

# Create .env.local file
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_ZK_DEVICE_IP=192.168.x.5
NEXT_PUBLIC_ZK_DEVICE_PORT=4370
EOF
```

---

### **STAGE 3: Add Employee (Database Only)**

```
Flow:
Admin → NextJS Form
  ├─ Name: Ali
  ├─ Email: ali@example.com
  ├─ Phone: 0300123456
  └─ Click "Add Employee"
       ↓
   NextJS Backend
   INSERT into Supabase.employees
       ↓
   Returns: id=1, employee_id=E001
       ↓
   Admin sees: "Employee E001 added!"
       ↓
   ✅ Employee in database

Next Step: Add to K60 device
```

---

### **STAGE 4: Add Employee to K60 Device**

```
Flow:
Admin → Dashboard
  └─ Click "Enroll in Device" (against E001)
       ↓
   NextJS Backend: POST /api/zkteco/enroll
   {
     "employee_id": 1,
     "zk_device_uid": 1,  // Unique ID for device
     "name": "Ali"
   }
       ↓
   NextJS connects to K60
   ```
   const Zkteco = require('zkteco-js');
   const device = new Zkteco('192.168.x.5', 4370);
   await device.createSocket();
   
   await device.setUser(
     1,              // UID on device (zk_device_uid)
     'E001',         // Employee ID
     'Ali',          // Employee name
     '123456'        // Password
   );
   
   await device.disconnect();
   ```
       ↓
   K60 device: "User 1 (Ali) added!"
       ↓
   Update Supabase
   UPDATE employees SET 
     zk_device_uid = 1, 
     enrollment_status = 'enrolled'
   WHERE id = 1
       ↓
   ✅ Employee ready for fingerprint enrollment
```

---

### **STAGE 5: Fingerprint Enrollment (Real-world)**

```
Employee→ Goes to K60 device (in office)
         ├─ K60 screen shows: "User 1, Please enter name"
         ├─ Employee presses: User 1 button
         ├─ Screen: "Please scan fingerprint 1/3"
         ├─ Employee scans thumb → ✅ Saved
         ├─ Screen: "Please scan fingerprint 2/3"
         ├─ Employee scans thumb → ✅ Saved
         ├─ Screen: "Please scan fingerprint 3/3"
         ├─ Employee scans thumb → ✅ Saved
         ├─ Screen: "Enrollment complete!"
         └─ Device: Employee fingerprints stored

No NextJS code needed - device handles it!
```

---

### **STAGE 6: Daily Attendance Marking (Automatic)**

```
Employee → Comes to office (9:15 AM)
         ├─ Walks to K60 device
         ├─ Puts thumb on scanner
         ├─ Device recognizes: "User 1 - Ali"
         ├─ Records attendance: 9:15 AM
         ├─ Device beeps: ✅ "Attendance marked"
         └─ Data stored in K60 internal memory

Backend → Every 30 seconds
         ├─ NextJS calls: GET /api/attendance/sync
         ├─ Connects to K60
         ├─ Fetches latest logs
         ├─ Inserts into Supabase
         └─ Marks as synced

Frontend → Real-time dashboard
          ├─ Shows: "Ali - 9:15 AM - Present"
          ├─ Shows: "Sara - 9:30 AM - Present"
          ├─ Auto-refreshes every 30 seconds
          └─ ✅ Live attendance visible
```

---

### **STAGE 7: Sync Attendance to Database**

```
NextJS API Route: POST /api/attendance/sync

Step 1: Connect to K60
```javascript
const Zkteco = require('zkteco-js');
const device = new Zkteco('192.168.x.5', 4370);
await device.createSocket();
```

Step 2: Get all attendance logs
```javascript
const logs = await device.getAttendances();
// Returns:
// [
//   { user_id: 1, punch_time: '2026-09-05 09:15:30' },
//   { user_id: 2, punch_time: '2026-09-05 09:30:15' }
// ]
```

Step 3: Find employee & insert into Supabase
```javascript
for (let log of logs) {
  // Find employee by zk_user_id
  const employee = await supabase
    .from('employees')
    .select('id')
    .eq('zk_device_uid', log.user_id)
    .single();
  
  // Insert attendance
  await supabase.from('attendance').insert({
    employee_id: employee.data.id,
    zk_user_id: log.user_id,
    check_in: log.punch_time,
    status: 'present',
    device_log_id: log.id
  });
}
```

Step 4: Disconnect
```javascript
await device.disconnect();
```

✅ Attendance now in Supabase!
```

---

### **STAGE 8: Show in Frontend Dashboard**

```
NextJS Page: app/dashboard/page.tsx

useEffect(() => {
  // Every 30 seconds, fetch latest attendance
  const interval = setInterval(async () => {
    const { data } = await supabase
      .from('attendance')
      .select(`
        id,
        check_in,
        status,
        employees(name, employee_id)
      `)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setAttendanceList(data);
  }, 30000); // 30 seconds
  
  return () => clearInterval(interval);
}, []);

// Render
<table>
  <thead>
    <tr>
      <th>Employee</th>
      <th>Time</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {attendanceList.map(record => (
      <tr key={record.id}>
        <td>{record.employees.name}</td>
        <td>{new Date(record.check_in).toLocaleTimeString()}</td>
        <td>{record.status}</td>
      </tr>
    ))}
  </tbody>
</table>

✅ Dashboard shows live attendance!
```

---

## 🔄 COMPLETE DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────┐
│              NEXTJS FRONTEND                        │
│  Dashboard showing attendance                       │
│  "Ali - 9:15 AM - Present"                         │
│  "Sara - 9:30 AM - Present"                        │
└──────────────────┬────────────────────────────────┘
                   │
                   │ fetch /api/attendance/sync
                   │ every 30 seconds
                   ↓
┌──────────────────────────────────────────────────────┐
│        NEXTJS BACKEND (API Route)                   │
│  /api/attendance/sync                               │
│  ├─ Connect to K60                                  │
│  ├─ Get logs from device                            │
│  ├─ Match with employees                            │
│  └─ Insert into Supabase                            │
└──────────────────┬────────────────────────────────┘
                   │
      ┌────────────┴──────────┐
      ↓                       ↓
┌──────────────┐      ┌───────────────┐
│ ZKTeco K60   │      │   Supabase    │
│ 192.168.x.5  │      │  PostgreSQL   │
│ :4370        │      │               │
│              │      │ ├─ Employees  │
│ Device Logs: │      │ └─ Attendance │
│ ├─ User 1    │      │               │
│ │ 9:15 AM    │      └───────────────┘
│ ├─ User 2    │            ↑
│ │ 9:30 AM    │            │
│ └─ ...       │            │
│              │            │
└──────────────┘ sync ──────┘
   (Real data)     (Processed & stored)
```

---

## 📝 IMPLEMENTATION CHECKLIST

```
PHASE 1: Database Setup
├─ ☐ Supabase account created
├─ ☐ Tables created (employees, attendance)
├─ ☐ Connection string copied
└─ ✅ Database ready

PHASE 2: NextJS Setup
├─ ☐ NextJS project created
├─ ☐ Dependencies installed (zkteco-js, supabase)
├─ ☐ .env.local configured
└─ ✅ Project ready

PHASE 3: Features Implementation
├─ ☐ Employee add form (Page)
├─ ☐ Employee list (Page)
├─ ☐ Add to K60 button (API + Page)
├─ ☐ Sync attendance button (API)
├─ ☐ Attendance dashboard (Page)
└─ ✅ All features done

PHASE 4: Testing
├─ ☐ Add employee → works
├─ ☐ Enroll in K60 → works
├─ ☐ Fingerprint enrollment → manual test
├─ ☐ Attendance sync → works
├─ ☐ Dashboard display → works
└─ ✅ All working

PHASE 5: Deployment
├─ ☐ Push to GitHub
├─ ☐ Deploy to Vercel
├─ ☐ Supabase live
└─ ✅ Production ready
```

---

## 🔐 SECURITY NOTES (Important)

```
1. ZK Device IP (192.168.x.5)
   - Keep in environment variable
   - Don't commit to GitHub
   - Set in Vercel Environment Variables

2. Supabase Keys
   - NEXT_PUBLIC_SUPABASE_URL (public OK)
   - NEXT_PUBLIC_SUPABASE_ANON_KEY (public OK)
   - SERVICE_ROLE_KEY (keep private!)

3. Network
   - K60 device on local LAN only
   - Laptop/server must be on same network
   - Won't work over internet (by design)
```

---

## 🚀 NEXT STEPS

```
1. ✅ Setup Supabase (DONE - this guide covers it)
2. ⏳ Create NextJS project with forms
   → AI Agent: Generate all React components
   → AI Agent: Generate all API routes
   
3. ⏳ Connect K60 device
   → Test connection
   → Add/enroll employee
   → Test attendance marking

4. ⏳ Deploy
   → Push to GitHub
   → Deploy to Vercel
   → Test in production
```

---

## 📚 USEFUL RESOURCES

```
ZKTeco JS Library:
https://github.com/coding-libs/zkteco-js
https://www.npmjs.com/package/zkteco-js

Supabase Docs:
https://supabase.com/docs

NextJS Docs:
https://nextjs.org/docs

K60 Device Specs:
Local network: 192.168.x.5:4370
User management via setUser()
Attendance logs via getAttendances()
```

---

## 🎯 SUMMARY

```
SIMPLEST FLOW:

1. Admin adds employee to database
   ↓
2. Admin clicks "Add to K60"
   (NextJS backend adds employee to device)
   ↓
3. Employee puts thumb on K60 (3x)
   (Device stores fingerprint)
   ↓
4. Employee comes to office, scans thumb
   (K60 records time automatically)
   ↓
5. NextJS syncs attendance every 30 seconds
   (Backend fetches from K60, stores in Supabase)
   ↓
6. Admin sees dashboard
   "Ali - 9:15 AM - Present" ✅
```

**No authentication needed!**
**No complex logic!**
**Just pure workflow!**

---

## ❓ TROUBLESHOOTING

```
Q: K60 device not connecting?
A: Check IP address (192.168.x.5)
   Check port 4370
   Check same network
   Firewall settings

Q: Attendance not syncing?
A: Check device has logs
   Check employee zk_device_uid matches
   Check Supabase connection

Q: Real-time updates slow?
A: Increase polling frequency (10 sec instead of 30)
   Or implement WebSocket for true real-time
```

---

**Ab Supabase setup kar lo. Phir AI Agent ko NextJS code likhaega!** 🚀
