# Digify CRM — Requirements & Development Plan

## 0. Context

This project extends an **existing Next.js + Supabase + ZKTeco attendance system** into a full **Company CRM**. The following already exists and must be preserved / built on top of, not rebuilt:

- Admin dashboard with employee & device management tables (search, filters, add/edit/delete, reusable popup forms)
- Employee → device assignment and biometric enrollment flow (user ID + name sent to ZKTeco device; fingerprint captured physically on the device; employee marked "enrolled" in DB)
- Attendance engine that connects to the active device via IP/port, fetches logs, saves them to Supabase, and matches records to employees via device UID

**Existing UI/UX (component style, table layout, popup forms, sidebar pattern) must be followed and reused for every new module described below** — do not introduce a new design language.

Company name used in system-generated emails: **Digify IT Solution**.

---

## 1. User Roles

### 1.1 Superadmin
- Created directly as a user row in Supabase (no public self-signup).
- Full access to every module described in this document.

### 1.2 Employee
- Account created by the Superadmin (not self-registered).
- Default access: **Dashboard**, **My Attendance**, **My Salary History** only.
- Can see additional pages/tables **only** if Superadmin explicitly grants access via Access Management (see §9).

### 1.3 Employee with granted access
- Same login as a normal employee, but with extra permissions (read-only / add / edit / delete) on specific tables, granted individually by the Superadmin.

---

## 2. Module: Employee Management

### 2.1 Sidebar-managed lookup lists
Before employees can be added, the Superadmin manages these lists from the sidebar (simple CRUD tables, same popup-form pattern as existing tables):

- **Shift Timings** — e.g. "4:00 PM – 1:00 AM", with explicit start time and end time stored.
- **Departments**
- **Positions**

These three lists feed dropdowns on the Add/Edit Employee form.

### 2.2 Add Employee form
Fields:

| Field | Type | Notes |
|---|---|---|
| Employee ID | Auto-generated | Sequential integer (1, 2, 3, 4…), read-only |
| Name | Text | Required |
| Phone Number | Text | Required |
| Email Address | Email | Required, used for login + notifications |
| Password | Password | Required, used for employee login |
| Shift Timing | Dropdown | Populated from Shift Timings list |
| Salary | Number | Base monthly salary |
| Department | Dropdown | Populated from Departments list |
| Position | Dropdown | Populated from Positions list |
| Physical Address | Text | Optional |
| CNIC Number | Text | Optional |
| Joining Date | Date | Optional |

On submit: create Supabase Auth user (role = employee) + employee record linked to it.

### 2.3 Employee table (list page)
Columns: Employee ID, Name, Department, Position, Shift, Status (Active/Inactive), Enrollment status.

Row actions:
- **View** → large popup showing all employee details (all fields above + enrollment status + device assigned).
- **Edit** → same form as Add, pre-filled.
- **Delete** → remove record (with confirmation).
- **Deactivate** → soft-disable login/access without deleting history.
- **Enroll** → existing enrollment flow: sends employee ID + name to the assigned ZKTeco device; admin then physically captures the fingerprint on the device.

---

## 3. Module: Attendance

### 3.1 Attendance status logic
Driven by each employee's assigned **Shift Timing** (start time, end time):

1. **First punch of the day** = check-in / session start.
   - If punch time is **within shift start window** → status = **Present**.
   - If punch time is **after the allowed grace window** (e.g. shift starts 4:00 PM, punch at 4:20 PM or later) → status = **Late**.
   - If the employee never punches at all during their shift window → status = **Absent**.
2. **Second punch of the day** = check-out / session end. The employee's shift session closes here.
3. **Hours-worked rule** (evaluated once check-out happens):
   - Worked hours **≤ 5** → final status = **Half Day**.
   - Worked hours **> 5** → final status = **Present** (overrides Late→still logs as late-arrival but present for hour purposes — see note below).

> Note for the agent: "Late" affects the **arrival** classification (used later in salary deductions), while "Present / Half Day / Absent" reflects the **day's final outcome** based on hours worked. Both values should be stored per attendance record: `arrival_status` (On-time / Late) and `day_status` (Present / Half Day / Absent).

### 3.2 Attendance page structure — two tabs

**Tab 1: Today's Attendance**
- List of all employees with today's punch status.
- Filter by Shift Timing.

**Tab 2: History**
- List of all employees.
- Clicking an employee opens their **monthly attendance view** (calendar/table of the selected month).
- Shows monthly summary: total Present, Late, Absent, Half Day counts.
- **Export** the monthly view to **PDF** or **Excel**.

---

## 4. Module: Salary Management

### 4.1 Add Salary flow
- Select **Employee** (dropdown).
- Select **Month**.
- System auto-calculates the salary record from that month's attendance data.

### 4.2 Deduction rules (auto-calculated, editable/toggleable by admin)

| Condition | Deduction |
|---|---|
| 3 Late days | 1 day's salary cut |
| 6 Late days | 2 days' salary cut |
| 3 Half days | 1 day's salary cut |
| 1 Absent day | 1 day's salary cut |

- Rules should scale proportionally (e.g. 9 late days → 3 days cut) — implement as a configurable rule engine, not hardcoded thresholds, so admin can adjust ratios later.
- Superadmin can **disable the late-arrival deduction** for a specific payout via a toggle; show a confirmation warning before disabling ("Late deductions will not be applied to this salary — continue?").
- Approved Leave days (§5) must **never** count toward Absent/deduction.

### 4.3 Summary & payout
- Show full breakdown before confirming: base salary, days late, days absent, days half-day, total cut amount, final payable amount.
- On **Pay**:
  - Record is marked as paid (with date).
  - Auto-create a corresponding entry in **Payment Tracking → Expenses** (§7).
  - Send an email to the employee from **Digify IT Solution**, notifying them their salary has been paid, with a **PDF salary slip** attached (breakdown of base salary, deductions, net pay, month, employee details).

---

## 5. Module: Leave Management

### 5.1 Employee side
- Employee applies for leave (date range + reason) from their dashboard.

### 5.2 Admin side
- New leave requests appear as **notifications** for the Superadmin.
- Superadmin can **Approve** or **Decline** each request.
  - **Approved** → those days are marked with status **Leave** in attendance (not Absent), and **not** counted in salary deductions.
  - **Declined** → no change; attendance for those days follows normal rules (Absent if unpunched, etc.).

---

## 6. Module: Company Accounts

Purpose: store login credentials for company-owned digital accounts (social media, tools, etc.), organized by company.

- Superadmin **adds a Company** (name, optional logo/notes).
- Inside each company, Superadmin **adds Accounts** — e.g. Facebook, Instagram — with:
  - Platform/account name
  - Login (username/email)
  - Password
- Accounts are listed grouped under their parent company.
- Full Edit/Update/Delete support.
- Passwords should be stored securely (encrypted at rest, masked in UI with a reveal/copy action) — not plain text.

---

## 7. Module: Payment Tracking

- Superadmin can **add Expenses** manually.
- **Salary payouts auto-populate here as Expenses** (see §4.3) — no manual duplicate entry.
- Superadmin can **add Revenue** entries.
- A **summary dashboard** shows: total revenue, total expenses, net (profit/loss), broken down by month, with the ability to view individual transactions.

---

## 8. Module: Settings

### 8.1 Profile settings
- Update own Name, Email, Password.

### 8.2 Access Management (RBAC)
- Superadmin selects an **Employee** and a **Table/Page/Module** (Employees, Attendance, Salary, Leave, Company Accounts, Payment Tracking, etc.).
- Grants granular permissions per module:
  - Read-only
  - Add
  - Edit
  - Delete
- Granted employee immediately gains access to that module (scoped to the permissions given) in their dashboard/sidebar.

---

## 9. Module: Employee Dashboard

- Employee logs in with the credentials created by the Superadmin.
- Default visible pages:
  - **Dashboard** (overview/summary)
  - **My Attendance**
  - **My Salary History**
  - **Apply for Leave** (part of Leave Management, employee-facing)
- Any additional module becomes visible **only** if granted via Access Management (§8.2), respecting the exact permission level given (e.g. read-only vs. full CRUD).

---

## 10. Data Model Notes (Supabase)

The agent should design/extend tables for at least:

- `companies_settings` (or reuse existing) — n/a, this is the internal accounts module, not to be confused with §6.
- `users` (Supabase Auth) + `profiles` (role: superadmin/employee, linked to `employees`)
- `employees` (extend existing table with: department_id, position_id, shift_id, salary, physical_address, cnic, joining_date, status)
- `shift_timings` (name, start_time, end_time, grace_minutes)
- `departments`
- `positions`
- `attendance_logs` (existing — extend with computed `arrival_status`, `day_status`, `hours_worked`, `session_start`, `session_end`)
- `leaves` (employee_id, start_date, end_date, reason, status: pending/approved/declined)
- `salaries` (employee_id, month, base_salary, late_days, absent_days, half_days, deduction_amount, net_pay, late_deduction_enabled, status: unpaid/paid, paid_at)
- `companies` (internal accounts module)
- `company_accounts` (company_id, platform_name, login, encrypted_password)
- `expenses` (source: manual/salary, amount, description, date)
- `revenues` (amount, description, date)
- `permissions` (employee_id, module, can_read, can_add, can_edit, can_delete)
- `notifications` (recipient_id, type, message, is_read, related_record_id)

---

## 11. Development Stages

Build in this order. Each stage should be fully functional and testable before moving to the next.

### Stage 1 — Foundation & Roles
- Superadmin Supabase user + role-based auth/session handling.
- Role-based route guarding (superadmin vs employee vs restricted employee).
- Sidebar restructure to accommodate all new modules (placeholders ok).

### Stage 2 — Lookup Lists
- Shift Timings CRUD (sidebar-managed).
- Departments CRUD.
- Positions CRUD.

### Stage 3 — Employee Management (extended)
- Extend Add/Edit Employee form with all new fields and dropdowns from Stage 2.
- Employee table with View (popup), Edit, Delete, Deactivate actions.
- Keep existing Enroll action wired to ZKTeco flow untouched.

### Stage 4 — Attendance Engine
- Implement shift-based arrival/day-status calculation logic on top of existing log-fetching pipeline.
- Today's Attendance tab with shift filter.
- History tab: per-employee monthly view + summary counts.
- PDF/Excel export for monthly attendance.

### Stage 5 — Leave Management
- Employee "Apply for Leave" UI.
- Admin notifications + Approve/Decline flow.
- Wire approved leave into attendance calculation (override absent) and exclude from salary deductions.

### Stage 6 — Salary Management
- Add Salary flow (employee + month selection).
- Deduction rule engine (configurable ratios) pulling from attendance + leave data.
- Summary/breakdown UI with late-deduction toggle + warning.
- Pay action: mark paid, auto-create Expense record, generate PDF salary slip, send email via Digify IT Solution sender identity.

### Stage 7 — Company Accounts
- Companies CRUD.
- Company Accounts CRUD (grouped under company), with encrypted password storage and masked/reveal UI.

### Stage 8 — Payment Tracking
- Manual Expense add.
- Manual Revenue add.
- Auto-linked salary expenses (from Stage 6).
- Summary dashboard (totals, monthly breakdown).

### Stage 9 — Settings & Access Management
- Profile settings (name/email/password).
- Access Management UI: per-employee, per-module, per-permission (read/add/edit/delete) grants.
- Enforce permissions across all modules built so far (middleware/guard layer).

### Stage 10 — Employee Dashboard
- Employee-facing Dashboard, My Attendance, My Salary History, Apply for Leave pages.
- Dynamic sidebar/menu rendering based on granted permissions from Stage 9.

### Stage 11 — Polish & QA
- End-to-end test of every flow with a real superadmin + real employee account.
- Verify emails (salary slip) and exports (PDF/Excel) render correctly.
- UI/UX consistency pass against the existing design system.
- Final deployment checklist.

---

## 12. Non-negotiable rules for the agent

1. Do not redesign existing UI components/patterns — reuse the current table, popup form, and sidebar structure for every new module.
2. Do not break the existing employee/device management or ZKTeco enrollment/attendance-fetch flow — extend it.
3. Every money-related and attendance-related calculation must be re-derivable/auditable (store raw punch data + computed status, not just the final status).
4. All new tables must respect Supabase Row Level Security aligned with the roles/permissions defined in §8.2 and §9.
5. Build and verify one stage at a time in the order listed in §11 before starting the next.
