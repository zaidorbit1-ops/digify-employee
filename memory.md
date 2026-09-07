# Project Memory

## 2026-09-07

- Implemented Stage 1 authentication foundation: Supabase email/password login page, cookie-backed SSR sessions, protected dashboard/API middleware, profile loading, role-aware navigation, and sign-out.
- Added the Superadmin/employee route boundary: employees cannot open current admin management routes or admin APIs; Superadmins retain the current management routes.
- Read and confirmed the CRM requirements and staged development plan.
- Confirmed the first Stage 1 setup step: create a Superadmin user in Supabase Authentication. The project will link that Auth user to a `profiles` row with `role = 'superadmin'`; a Superadmin does not need an employee record.
- Added the CRM foundation migration: `supabase/migrations/20260907120000_crm_foundation.sql`.
- The migration preserves the existing ZKTeco tables and extends employees and attendance with the fields needed for roles, lookup lists, shifts, leave, salary, finance, company accounts, permissions, and notifications.
- Added role-aware RLS foundations and the `public.is_superadmin()` helper. Login/session implementation and the Stage 1 UI still need to be built before the new authenticated policies can be used by the application.

## Existing Work Completed Before This Log

- Restored the Next.js project scripts and dependencies so `npm run dev` works.
- Added Tailwind/PostCSS dependencies and verified the production build.
- Built themed Employees and Devices management pages using the existing coral visual system.
- Added reusable add/edit modal forms, searchable/filterable tables, edit actions, delete actions, and device test controls.
- Added employee enrollment status and `Enroll`/`Re-enroll` actions connected to the ZKTeco enrollment API.
- Existing enrollment sends the employee UID and name to the selected ZKTeco device; fingerprint capture remains a physical step on the device.
- Existing attendance sync connects to the active device, fetches logs, upserts them into Supabase, and maps logs back to employees through the device UID.

## Stage Completion Log

### Stage 1 Complete — 2026-09-07

- Added Supabase email/password login.
- Added cookie-backed sessions and protected dashboard/API middleware.
- Added profile and role loading for Superadmin and Employee users.
- Added role-aware sidebar navigation and sign-out.
- Restricted employee accounts from the current Superadmin management pages and APIs.

### Stage 2 Complete — 2026-09-07

- Added the sidebar-managed `Lookup lists` page at `/dashboard/lookups`.
- Added Shift Timings CRUD with name, start time, end time, and grace minutes.
- Added Departments CRUD.
- Added Positions CRUD.
- Added reusable search, add, edit, delete, modal, table, status messaging, and responsive layout patterns for all three lookup lists.
- Added the generic authenticated API route at `/api/lookups/[type]` for shifts, departments, and positions.
- Added the Lookup Lists sidebar icon and dashboard title mapping.

### Stage 3 Complete — 2026-09-07

- Extended employee management with all required profile fields: phone, email, password, shift, salary, department, position, address, CNIC, joining date, status, device, and device UID.
- Connected Shift Timings, Departments, and Positions from Stage 2 to the employee form dropdowns.
- Added Supabase Auth employee account creation and linked each account to the employee record and `profiles` table.
- Added account-aware employee edit, password update, deactivate/activate, delete, and profile status handling.
- Added employee View popup with a premium profile header, grouped work/personal/device details, and status badges.
- Redesigned the employee table into a denser, compact layout with reduced spacing while preserving View, Edit, Delete, Deactivate, and Enroll actions.
- Preserved the existing ZKTeco enrollment flow and added clear enrollment status and Re-enroll action.

### Stage 4 Complete — 2026-09-07

- Added a central shift-based attendance calculation engine in `lib/attendance.ts`.
- Attendance now derives arrival status from shift start time plus grace minutes.
- Attendance now derives day status from punches and worked hours, including Present, Half Day, Absent, and approved Leave.
- Stored computed attendance fields during ZKTeco sync: arrival status, day status, hours worked, session start, and session end.
- Preserved raw device punches and existing ZKTeco fetch/upsert flow.
- Rebuilt the Attendance page with Today and History tabs.
- Added Today shift filtering and session/hour visibility.
- Added monthly employee summaries for Present, Late, Absent, Half Day, and Leave.
- Added employee monthly daily view with month selection.
- Added CSV export compatible with Excel and browser print export for PDF.

### Stage 4 UI Polish — 2026-09-07

- Removed employee IDs from the Today attendance table display.
- Added a compact single-line toolbar with employee search, shift filter, Excel export, and PDF print export icons.
- Changed History to show only the employee summary list.
- Added a dedicated monthly detail page at `/dashboard/attendance/[employeeId]` opened from the History list.
- Added monthly detail stats and daily attendance rows for the selected employee.
- Sundays are now excluded from generated attendance days and treated as weekly holidays rather than Absent.