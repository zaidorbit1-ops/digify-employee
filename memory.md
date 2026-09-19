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

### Background Attendance Sync — 2026-09-07

- Added `scripts/attendance-worker.cjs` so ZKTeco attendance sync runs independently of the Attendance page.
- Added `npm run attendance:worker`, polling the local Next.js sync endpoint every 15 seconds.
- Added a protected worker secret in `.env.local` and allowed only that secret to call the worker sync endpoint without a browser session.
- Added the Supabase Realtime migration `supabase/migrations/20260907130000_attendance_realtime.sql`.
- Added an app-wide browser attendance notifier for Superadmin tabs, so new attendance can notify the user while working in another browser tab.
- The worker was started successfully and checked 125 logs from the configured Main Gate Device.

### Attendance Corrections & Live Session UI — 2026-09-07

- Corrected shift comparison to use the configured office timezone (`ATTENDANCE_TIMEZONE_OFFSET_MINUTES=300`), so a 9 PM punch is Late for a 4 PM shift.
- Restored global attendance popup and voice announcement for new realtime attendance events, including the employee name.
- Replaced raw session timestamps with live worked duration in hours and minutes.
- Added exact `worked_minutes` storage and migration for completed sessions.
- Added Superadmin `Edit time` and testing `Clear` actions on Today attendance records.

### Stage 5 Partial Completion — Admin Side — 2026-09-07

- Implemented the admin-side leave review flow for the Stage 5 requirement: Superadmin can review leave requests, approve or decline them, and the employee receives a leave-status notification.
- Added leave management API endpoints at `/api/leaves` and `/api/leaves/[employeeId]` to list requests, create employee leave entries, and update request status.
- Added the admin leave dashboard page at `/dashboard/leave` with search, status filter, review modal, approve, and decline actions.
- Added the Leave item to the main sidebar so the Superadmin can access the review page directly.
- This completes the admin-side portion of Stage 5 as required by the project plan. The employee-facing leave application flow and the final attendance/salary integration for approved leave are still pending as the remaining work for Stage 5 completion.

### Stage 6 Partial Completion — 2026-09-07

- Implemented the admin salary review and payout flow with automatic late, half-day, and absent deduction calculations.
- Added PKR salary formatting, recent paid salaries list, and an Add salary popup for admin adjustments.
- The popup allows the admin to skip late or absent deductions, enter a custom overall deduction amount, and add an admin note before confirming payment.
- Salary payout records now store the custom deduction amount and adjustment note, and paid salary payouts create an expense record.
- Stage 6 is partially complete: sending the salary email to the employee is not implemented yet. PDF salary slip generation and email delivery from Digify IT Solution remain pending.

### Stage 7 Complete — 2026-09-08

- Added the Company Accounts page at `/dashboard/company-accounts` with Companies CRUD and accounts grouped under each company.
- Added full account CRUD for platform name, login, and password, including edit, delete, company cascade delete, masked password display, reveal, and copy actions.
- Added server-side AES-256-GCM encryption for account passwords; normal list responses never return decrypted passwords.
- Added admin APIs at `/api/companies`, `/api/company-accounts`, and `/api/company-accounts/[id]/reveal`.
- Added `supabase/migrations/20260908100000_company_account_password_ciphertext.sql` to store the encrypted text envelope safely.
- Added the three-column company card grid and separate company detail pages at `/dashboard/company-accounts/[companyId]`.
- Added admin password re-authentication before revealing or copying an account password.
- Stage 7 is fully completed. The migration has been applied and `COMPANY_ACCOUNTS_ENCRYPTION_KEY` is configured in the server environment.

### Stage 8 Complete — 2026-09-08

- Added the Payment Tracking dashboard at `/dashboard/payments` with monthly transaction filtering and summary cards for total revenue, total expenses, and net profit/loss in PKR.
- Added manual Expense and Revenue creation through modal forms, with edit and delete actions for manual transactions.
- Salary-linked expenses are displayed as read-only `salary` transactions and cannot be manually deleted or duplicated.
- Added the authenticated `/api/payments` endpoint for finance summaries and transaction CRUD.
- Made salary expense creation idempotent with `salary_id` upsert protection, so retrying a salary payout does not create duplicate expenses.
- Stage 8 is fully completed and the production build passes successfully.

### Stage 9 Complete — 2026-09-08

- Added the Settings page at `/dashboard/settings` for updating the signed-in user's name, email, and password.
- Added Superadmin Access Management with searchable employee selection, quick employee chips, per-module Read/Add/Edit/Delete permissions, and a per-row `All` checkbox.
- Added a granted-access overview table showing which employee has which module permissions.
- Added `/api/permissions` for permission loading and upsert management.
- Added middleware enforcement for dashboard routes and API methods based on module permissions.
- Added Stage 9 RLS migration `supabase/migrations/20260908110000_stage9_profile_permissions.sql` for self-profile updates and employee permission reads.
- Stage 9 implementation is complete; the new Supabase migration must be applied with `supabase db push` if it has not been run yet.

### Stage 10 Complete — 2026-09-08

- Added the employee personal dashboard at `/dashboard`, separate from the Superadmin overview.
- Added employee pages for `/dashboard/my-attendance`, `/dashboard/my-salary`, and `/dashboard/apply-leave`.
- Added employee navigation with Dashboard, My Attendance, My Salary History, Apply for Leave, and Settings.
- Added self-scoped APIs at `/api/me`, `/api/me/attendance`, `/api/me/salaries`, and `/api/me/leaves`; employees can only read or submit records linked to their own profile.
- Added personal attendance month filtering, salary history in PKR, leave submission, and leave status history.
- Updated middleware so employee default routes work while additional modules remain controlled by Stage 9 permissions.
- Stage 10 is fully completed and the production build passes successfully.
- Refined Stage 10 with an isolated employee route folder: `/dashboard/employee`, `/dashboard/employee/attendance`, `/dashboard/employee/salary`, and `/dashboard/employee/leave`.
- Employee sidebar now shows only personal default pages plus admin module links explicitly granted with `can_read` permission; Superadmin navigation remains separate.

## 2026-09-18 — Stage 1: CRM Shell & Company Management

### Objective
Create the Superadmin Business CRM shell and the foundation for managing multiple CRM companies without changing Employee/Attendance behavior.

### Work Completed
- Added the Superadmin sidebar switch between Employee Management and Business CRM.
- Added CRM navigation for Overview, Companies, Leads, Contacts, Webmail, Email Templates, Campaigns, Automations, Analytics, and CRM Settings.
- Added the CRM Overview page at `/dashboard/crm`.
- Added the CRM Companies page at `/dashboard/crm/companies`.
- Added create, edit, delete, status, description, website metadata, and logo URL controls.
- Added company cards showing logo, status, description, and primary website details.
- Added the authenticated CRM companies API at `/api/crm/companies`.

### Database Changes
- Used the already-applied CRM migration `supabase/migrations/20260918110000_crm_all_entities.sql`.
- CRM companies use `crm_companies`; website metadata uses `crm_websites`.
- Existing `companies` and `company_accounts` tables were not modified.

### Files Changed
- `app/api/crm/companies/route.ts`
- `app/app/dashboard/crm/page.tsx`
- `app/app/dashboard/crm/layout.tsx`
- `app/app/dashboard/crm/companies/page.tsx`
- `components/layout/sidebar.tsx`
- `components/layout/app-shell.tsx`
- `memory.md`

### Architecture / Decisions
- CRM tenancy remains separate from the existing employee/company-account feature.
- CRM company API operations require an active Superadmin profile and rely on the CRM RLS policies.
- Logo URLs are validated as HTTP/HTTPS URLs and stored in `crm_companies.logo_url`; the UI loads the logo from the supplied URL.
- Stage 1 manages one primary website per company in the UI; the schema still supports multiple websites for later stages.

### Integration Details
- API: `/api/crm/companies`
- No external services or new environment variables were added.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Build emitted only the existing Next.js middleware deprecation warning.
- Supabase migration was applied by the project owner before Stage 1 implementation.

### Problems / Errors
- The initial API draft incorrectly treated the website URL as a logo value. This was corrected before UI completion so websites are stored in `crm_websites`.

### Current Status
- Stage status: Completed

### Next Step
Stage 2 — CRM Database Foundation & Company Websites, pending explicit approval.

## 2026-09-18 — Stage 2: CRM Database Foundation & Company Websites

### Objective
Complete the CRM company website foundation with multiple company-scoped websites and secure website integration identities.

### Work Completed
- Added Superadmin-authorized multi-website CRUD APIs.
- Added website management to the CRM Companies page, including add, edit, delete, technology, hosting provider, and status controls.
- Added separate integration identity creation for each website.
- Generated public identifiers and one-time secrets server-side; only the SHA-256 secret hash is stored.
- Added website list display with integration status and identifiers.

### Database Changes
- Used the applied CRM foundation tables `crm_websites` and `crm_website_integrations` from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `lib/crm-admin.ts`
- `app/api/crm/websites/route.ts`
- `app/api/crm/website-integrations/route.ts`
- `app/dashboard/crm/companies/page.tsx`
- `memory.md`

### Architecture / Decisions
- Website records are always queried and created with a CRM company relationship.
- Integration secrets are never returned after creation and are never stored in plaintext.
- Hosting provider and website technology remain metadata only; company identity comes from the CRM company and website records.

### Integration Details
- APIs: `/api/crm/websites` and `/api/crm/website-integrations`
- No new environment variables or external services were added.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Build emitted only the existing Next.js middleware deprecation warning.

### Problems / Errors
- Corrected the one-time secret display flow so refreshing the website list does not clear the newly generated secret before the administrator can copy it.

### Current Status
- Stage status: Completed

### Next Step
Stage 3 — Website Lead Ingestion API, pending explicit approval.

## 2026-09-18 — Stage 3: Website Lead Ingestion API

### Objective
Allow authenticated external company websites to submit leads into the correct CRM company and website without permitting company spoofing or cross-company assignment.

### Work Completed
- Added the public `POST /api/crm/integrations/leads` endpoint.
- Added integration authentication using the website public identifier and secret, with timing-safe hash comparison.
- Added support for JSON and form-encoded submissions from React, Next.js, PHP, WordPress, and other website implementations.
- Added validation and normalization for names, emails, phone, messages, form names, source URLs, and custom fields.
- Derive `company_id`, `website_id`, and `integration_id` exclusively from the authenticated integration.
- Added duplicate detection using company plus normalized email while preserving repeated lead submissions.
- Updated middleware so only this specific CRM ingestion route can be called without a user session.

### Database Changes
- Writes leads to the applied `crm_leads` table.
- Updates `crm_website_integrations.last_received_at` after successful ingestion.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/integrations/leads/route.ts`
- `middleware.ts`
- `memory.md`

### Architecture / Decisions
- Public ingestion uses the server-only Supabase service-role client; the service-role credential is never exposed to external websites or browser code.
- Integration credentials are accepted through `x-crm-integration-id` and `x-crm-integration-secret`, with Bearer secret support.
- Invalid credentials return `401`, inactive integrations return `403`, malformed payloads return `400`, and successful submissions return `201`.
- Duplicate leads remain distinguishable records and are reported with `duplicate: true` and `duplicate_of`.

### Integration Details
- Endpoint: `POST /api/crm/integrations/leads`
- Headers: `x-crm-integration-id`, `x-crm-integration-secret`
- No new environment variables were added.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Invalid credentials returned `401`.
- Missing credentials returned `401`.
- Temporary end-to-end integration test returned `201` for a valid lead, `201` with `duplicate: true` for a repeated email, and `400` for missing email; temporary records were removed after testing.

### Problems / Errors
- Corrected validation handling so malformed lead data returns a useful `400` response instead of a generic `500` error.

### Current Status
- Stage status: Completed

### Next Step
Stage 4 — CRM Leads Interface & Contact Conversion, pending explicit approval.

## 2026-09-18 — Stage 4: CRM Leads Interface & Contact Conversion

### Objective
Show company-scoped website leads in CRM, support lead management, and convert leads to contacts without uncontrolled duplicates.

### Work Completed
- Replaced the Leads placeholder with a searchable and filterable leads workspace.
- Added company, status, website, date range, and search filters.
- Added lead table and detail modal with source website, form, source URL, message, phone, email, and received time.
- Added status changes for new, contacted, qualified, converted, and lost.
- Added lead notes with success/error feedback inside the detail modal.
- Added a `mailto:` Send email action without starting the later CRM mailbox stage early.
- Added duplicate-safe Convert to contact behavior and preserved the original lead record.
- Added contact-linked timeline event on successful conversion.

### Database Changes
- Uses the applied `crm_leads`, `crm_contacts`, and `crm_contact_timeline` tables.
- Pre-conversion notes are preserved in the lead `custom_data.notes` JSON array because the timeline table requires a contact.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/leads/route.ts`
- `app/api/crm/leads/[id]/route.ts`
- `app/dashboard/crm/leads/page.tsx`
- `memory.md`

### Architecture / Decisions
- All lead reads and writes require an active Superadmin session and remain company-scoped through the lead record.
- Contact conversion matches `company_id + normalized_email`; it reuses an existing contact when available and creates a new one only when needed.
- CRM mailbox sending remains reserved for Stage 6; Stage 4 uses a safe mail client handoff through `mailto:`.

### Integration Details
- APIs: `/api/crm/leads` and `/api/crm/leads/[id]`
- No new environment variables or external services were added.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Existing Employee/Attendance routes remained included in the successful production build.

### Problems / Errors
- Corrected the contact conversion response so linking to an existing contact is reported accurately instead of appearing as a newly created contact.

### Current Status
- Stage status: Completed

### Next Step
Stage 5 — CRM Contacts & Import System, pending explicit approval.

## 2026-09-18 — Stage 5: CRM Contacts & Import System

### Objective
Create the central company-scoped CRM contact database with manual management, tags, search, archive behavior, and validated CSV/Excel imports.

### Work Completed
- Replaced the Contacts placeholder with the full contact database workspace.
- Added company, status, and search filters.
- Added manual contact create and edit flows with inline modal feedback.
- Added contact detail view and tag display.
- Added company-scoped contact tags and tag links.
- Added archive behavior instead of destructive contact deletion.
- Added CSV, XLS, and XLSX file parsing through the `xlsx` package.
- Added upload, parse, preview, row validation, duplicate detection, invalid-row display, confirmation, and result summary.
- Added imported, duplicate, invalid, and failed counts.

### Database Changes
- Uses the applied `crm_contacts`, `crm_contact_tags`, and `crm_contact_tag_links` tables.
- Contact uniqueness remains company plus normalized email.
- Archived contacts remain stored for history and are not silently deleted.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/contacts/route.ts`
- `app/api/crm/contacts/[id]/route.ts`
- `app/api/crm/contacts/import/route.ts`
- `app/dashboard/crm/contacts/page.tsx`
- `package.json`
- `package-lock.json`
- `memory.md`

### Architecture / Decisions
- All contact operations require an active Superadmin session and use company relationships from the request or existing contact record.
- Import preview runs validation and duplicate detection before confirmation; invalid rows are displayed rather than discarded.
- The import flow inserts only valid, non-duplicate rows after explicit confirmation.
- Contact tags are normalized into the CRM tag tables rather than stored only as display text.

### Integration Details
- APIs: `/api/crm/contacts`, `/api/crm/contacts/[id]`, and `/api/crm/contacts/import`
- Added dependency: `xlsx` for CSV and Excel parsing.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Build includes existing Employee/Attendance routes and all CRM routes.

### Problems / Errors
- Corrected an accidental patch-marker syntax issue in the new Contacts page before validation.
- `npm install xlsx` reported one high-severity audit finding; no unrelated dependency changes were made beyond the required spreadsheet parser.

### Current Status
- Stage status: Completed

### Next Step
Stage 6 — Webmail Mailbox Connections, pending explicit approval.

## 2026-09-18 — Stage 6: Webmail Mailbox Connections

### Objective
Connect company webmail accounts using IMAP/SMTP credentials without exposing mailbox passwords to the browser and without mixing CRM mailbox data with the existing `companies` or `company_accounts` system.

### Work Completed
- Added the CRM mailbox encryption utility using server-side AES-256-GCM storage for mailbox credentials.
- Added the authenticated mailboxes API at `/api/crm/mailboxes` with create, edit, delete, and test actions.
- Added IMAP/SMTP validation logic for mailbox host, port, SSL/TLS selection, username, and password.
- Added mailbox status tracking for pending, connected, error, and disconnected states.
- Added a company-scoped webmail interface at `/dashboard/crm/webmail` for managing mailboxes.
- Added add/edit modal flow, test connection buttons, disconnect flow, and delete actions.
- Kept passwords out of browser JavaScript and avoided storing plaintext credentials.

### Database Changes
- Uses the applied `crm_mailboxes` table from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- Credentials are encrypted before storage, with the decryption path used only on the server.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `lib/crm-mailboxes-crypto.ts`
- `app/api/crm/mailboxes/route.ts`
- `app/dashboard/crm/webmail/page.tsx`
- `memory.md`

### Architecture / Decisions
- Mailboxes remain company-scoped and are not merged into the existing company-account credential system.
- Browser forms never receive the real password value; only a secure server-side connection test uses the decrypted credentials.
- Mailbox testing uses the app server as the connection source, which means localhost can work if the server machine can reach the provider.

### Testing
- `npx tsc --noEmit --pretty false` passed successfully.

### Current Status
- Stage status: Completed

### Next Step
Stage 7 — CRM Webmail Interface, pending explicit approval.

## 2026-09-18 — Stage 7: CRM Webmail Interface

### Objective
Provide a real CRM webmail workspace where an administrator can open a connected mailbox, sync Inbox messages, read email, search conversations, and send email from the connected account.

### Work Completed
- Added the dedicated mailbox workspace at `/dashboard/crm/webmail/[mailboxId]`.
- Added a premium three-pane webmail layout with folders, conversation list, and desktop reading pane.
- Added Inbox, Sent, Drafts, Starred, Archive, Trash, and Spam navigation states.
- Added conversation search, unread styling, sender initials, timestamps, message previews, and read-message handling.
- Added real Inbox synchronization through IMAP using `imapflow` and MIME parsing through `mailparser`.
- Persisted synced threads and messages in `crm_email_threads` and `crm_email_messages`.
- Added automatic CRM contact linking when an incoming sender matches a company contact email.
- Added server-side Compose email flow using SMTP through `nodemailer`.
- Persisted sent messages as outbound CRM email threads/messages after successful delivery.
- Kept mailbox credentials server-side and encrypted; browser responses never expose the mailbox password.
- Made the mailbox overview page account-focused by removing Inbox previews and sync controls from mailbox cards.
- Mailbox cards now link cleanly into the dedicated webmail workspace.

### Database Changes
- Uses the applied `crm_email_threads` and `crm_email_messages` tables from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required for the implemented Stage 7 core flow.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/webmail/route.ts`
- `app/dashboard/crm/webmail/page.tsx`
- `app/dashboard/crm/webmail/[mailboxId]/page.tsx`
- `package.json`
- `package-lock.json`
- `memory.md`

### Dependencies Added
- `imapflow` for real IMAP mailbox access.
- `mailparser` and `@types/mailparser` for MIME message parsing.
- `nodemailer` and `@types/nodemailer` for server-side SMTP sending.

### Architecture / Decisions
- IMAP synchronization and SMTP sending run only on the server.
- The browser receives message data but never receives mailbox credentials.
- Sync imports the latest Inbox messages, upserts by provider message identifier, and avoids duplicate records.
- Incoming messages are stored as inbound messages; composed messages are stored as outbound messages.
- The mailbox overview remains separate from the actual webmail workspace for a cleaner user experience.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Production build includes `/api/crm/webmail` and `/dashboard/crm/webmail/[mailboxId]`.
- Existing Employee/Attendance routes and CRM routes remain included in the successful production build.

### Current Status
- Stage 7 core webmail interface: Completed.
- Advanced reply, reply-all, forward, attachment upload, and automatic background sync remain future enhancements within the broader webmail roadmap.

## 2026-09-18 — Stage 8: Custom Email Templates

### Objective
Allow the administrator to create reusable company-scoped marketing and operational email templates.

### Work Completed
- Replaced the Email Templates placeholder at `/dashboard/crm/templates` with a working template management workspace.
- Added company selection and company-scoped template loading.
- Added template name, subject, HTML/body content, plain-text fallback, status, variables, and timestamps.
- Added supported personalization variables: `{{first_name}}`, `{{last_name}}`, `{{email}}`, and `{{company_name}}`.
- Added draft, active, and archived template statuses.
- Added desktop and mobile preview modes using a sandboxed preview frame with sample variable data.
- Added create, edit, duplicate, delete, and test-email actions.
- Added test email delivery through a connected encrypted CRM mailbox using server-side SMTP.
- Added safe variable replacement for rendering; variables are not executed as HTML or code.

### Database Changes
- Uses the applied `crm_email_templates` table from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/templates/route.ts`
- `app/dashboard/crm/templates/page.tsx`
- `memory.md`

### Architecture / Decisions
- Template records remain company-scoped and require Superadmin access.
- HTML preview runs inside a sandboxed iframe.
- Mailbox credentials are decrypted only inside the server-side test-email route.
- A reliable HTML/text editor was used as required; drag-and-drop design can be added later without changing the template contract.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Production build includes `/api/crm/templates` and `/dashboard/crm/templates`.
- Existing Employee/Attendance and CRM routes remain included in the successful build.

### Current Status
- Stage 8: Completed.

## 2026-09-19 — Stage 9: Campaign Builder

### Objective
Create company-scoped campaigns that select an audience, sender mailbox, reusable email template, schedule, and controlled sending settings without starting a browser-side delivery loop.

### Work Completed
- Replaced the Campaigns placeholder at `/dashboard/crm/campaigns` with a working campaign planning workspace.
- Added campaign name, company, audience, sender mailbox, template, reply-to, subject override, from name, schedule, interval, batch size, and status controls.
- Added campaign statuses: draft, scheduled, paused, cancelled, running, completed, and failed.
- Added template selection with automatic subject prefill from the selected email template.
- Added connected mailbox selection for the sender identity.
- Added campaign review checklist and clear separation between planning and delivery.
- Added one-message test send through the selected encrypted mailbox using server-side SMTP.
- Added campaign create, edit, delete, company filtering, and status display.

### Database Changes
- Uses the applied `crm_campaigns` table from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/campaigns/route.ts`
- `app/dashboard/crm/campaigns/page.tsx`
- `memory.md`

### Architecture / Decisions
- Campaign operations require Superadmin access and remain company-scoped.
- Saving a scheduled campaign only records the campaign plan.
- The browser never maintains a bulk sending loop; persistent queue delivery is reserved for Stage 10.
- Test sends use server-side SMTP and encrypted mailbox credentials.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Production build includes `/api/crm/campaigns` and `/dashboard/crm/campaigns`.
- Existing Employee/Attendance and CRM routes remain included in the successful build.

### Current Status
- Stage 9: Completed.

## 2026-09-19 — Stage 10: Email Queue & Sending Engine

### Objective
Deliver scheduled campaign emails through a persistent server-side queue with safe claiming, configurable rate controls, retries, failure reporting, and restart continuity.

### Work Completed
- Added the campaign queue migration at `supabase/migrations/20260919100000_crm_campaign_queue_worker.sql`.
- Added due-message indexes for queue polling and campaign-contact status checks.
- Added the Supabase `claim_crm_campaign_message` function using row locking and `SKIP LOCKED` to prevent duplicate processing by concurrent workers.
- Added the standalone worker at `scripts/crm-campaign-worker.cjs`.
- Added `npm run crm:campaign-worker` for continuous server-side campaign delivery.
- Added `--once` worker mode for controlled testing and maintenance runs.
- Added campaign materialization from active company contacts into `crm_campaign_contacts` and `crm_campaign_messages`.
- Added configurable batch size and interval scheduling from each campaign record.
- Added SMTP delivery through the selected encrypted CRM mailbox.
- Persisted provider message IDs and sent timestamps.
- Added retry handling with exponential backoff and configurable maximum attempts.
- Added permanent failure status and useful error messages on queue records.
- Added sent and failed email event records.
- Worker only claims messages from running campaigns, so paused and cancelled campaigns stop safely.
- Existing queued messages remain in the database and resume after a worker restart.

### Database Changes
- Added `supabase/migrations/20260919100000_crm_campaign_queue_worker.sql`.
- Added queue indexes and the atomic claim function.
- Uses existing `crm_campaigns`, `crm_campaign_contacts`, `crm_campaign_messages`, and `crm_email_events` entities.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `supabase/migrations/20260919100000_crm_campaign_queue_worker.sql`
- `scripts/crm-campaign-worker.cjs`
- `package.json`
- `memory.md`

### Architecture / Decisions
- The browser never runs the campaign sending loop.
- The worker uses the Supabase service-role key and server-side mailbox decryption only.
- Queue claiming is database-controlled so two workers cannot claim the same message at the same time.
- Schedule, interval, batch size, pause, cancel, retry, and restart behavior are persisted in the database.
- Stage 11 delivery/open/click analytics remains separate from the Stage 10 sending engine.

### Testing
- `node --check scripts/crm-campaign-worker.cjs` passed.
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Production build includes the CRM campaign API and existing CRM webmail/template routes.
- The new Supabase migration must be applied before running the worker: `supabase db push`.

### Current Status
- Stage 10: Completed.

## 2026-09-19 — Stage 11: Delivery, Open, Click & Error Tracking

### Objective
Provide campaign delivery analytics, recipient drill-down, useful failure visibility, and best-effort engagement tracking without presenting opens as guaranteed human reads.

### Work Completed
- Replaced the Analytics placeholder at `/dashboard/crm/analytics` with a campaign analytics dashboard.
- Added company and campaign filters.
- Added summary metrics for recipients, sent, pending, failed, delivered, bounced, opened, clicked, replied, and unsubscribed.
- Added recipient-level drill-down showing contact, delivery status, recorded events, and delivery errors.
- Added public open-tracking pixel route at `/api/crm/tracking/open/[messageId]`.
- Added public click-tracking redirect route at `/api/crm/tracking/click/[messageId]`.
- Updated the campaign worker to inject a best-effort open pixel and rewrite HTTP(S) links through the click tracker when a public URL is configured.
- Added event records for tracked opens and clicks in `crm_email_events`.
- Kept tracking callbacks non-blocking so tracking failures never prevent an email from rendering or a link from opening.
- Added a clear dashboard disclaimer that tracking is not a guaranteed human-read signal because email clients can block, cache, or proxy tracking resources.

### Database Changes
- Uses the existing `crm_email_events` table from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required for Stage 11.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/analytics/route.ts`
- `app/dashboard/crm/analytics/page.tsx`
- `app/api/crm/tracking/open/[messageId]/route.ts`
- `app/api/crm/tracking/click/[messageId]/route.ts`
- `middleware.ts`
- `scripts/crm-campaign-worker.cjs`
- `memory.md`

### Configuration
- Set `CRM_PUBLIC_URL` to the public hosted app URL for open/click tracking to work in delivered emails.
- Do not use `localhost` for tracking URLs because recipients cannot reach a local machine.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `node --check scripts/crm-campaign-worker.cjs` passed.
- `npm run build` passed.
- Production build includes `/api/crm/analytics`, `/dashboard/crm/analytics`, and both tracking routes.

### Current Status
- Stage 11: Completed.

## 2026-09-19 — Stage 12: Reply Sync & Unified Contact Timeline

### Objective
Match incoming mailbox replies to the correct CRM conversation/contact and connect campaign, mailbox, lead, and admin email activity into one contact timeline.

### Work Completed
- Improved IMAP reply matching using `Message-ID`, `In-Reply-To`, and `References` headers.
- Reuses the existing email thread when an inbound message references a known CRM message.
- Uses sender email as a fallback contact match only when header matching does not identify a contact.
- Stores inbound reply metadata, message IDs, references, and thread links in the existing email message tables.
- Adds deduplicated `email_received` and `email_replied` contact timeline events for incoming mail.
- Adds `admin_replied` timeline events when an administrator sends webmail to a known contact.
- Adds `campaign_email_sent` timeline events from the campaign worker.
- Added authenticated contact timeline API at `/api/crm/contacts/[id]/timeline`.
- Preserved the existing lead conversion timeline and CRM email history models.

### Database Changes
- Uses the existing `crm_email_threads`, `crm_email_messages`, and `crm_contact_timeline` tables from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required for the reply-sync implementation.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/webmail/route.ts`
- `app/api/crm/contacts/[id]/timeline/route.ts`
- `scripts/crm-campaign-worker.cjs`
- `memory.md`

### Architecture / Decisions
- Thread matching does not rely only on email subject text.
- Timeline writes are company-scoped and require authenticated CRM access, except for internal worker writes using the service role.
- Duplicate timeline events are avoided by provider message ID metadata.
- Contact timeline data is exposed through a dedicated API so CRM contact surfaces can consume one unified activity stream.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `node --check scripts/crm-campaign-worker.cjs` passed.
- `npm run build` passed.
- Production build includes `/api/crm/contacts/[id]/timeline` and the updated webmail sync path.

### Current Status
- Stage 12: Completed.

## 2026-09-19 — Stage 13: Segments & Advanced Campaign Audiences

### Objective
Create reusable company-scoped audiences from structured contact rules and apply those audiences during campaign queue preparation.

### Work Completed
- Added the Segments workspace at `/dashboard/crm/segments`.
- Added company-scoped segment create, edit, delete, and list operations.
- Added reusable segment descriptions and up to 10 rules per segment.
- Added supported fields: first name, last name, email, status, and source.
- Added supported operators: equals, not equals, contains, and starts with.
- Combined segment rules with AND logic.
- Rejected arbitrary SQL and unsupported fields/operators at the API boundary.
- Added Segments to CRM navigation.
- Updated the campaign worker to evaluate the selected segment before creating campaign recipients and queue messages.
- Preserved the existing all-active-contacts behavior when no segment is selected.

### Database Changes
- Uses the applied `crm_segments` table from `supabase/migrations/20260918110000_crm_all_entities.sql`.
- No new migration was required.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/segments/route.ts`
- `app/dashboard/crm/segments/page.tsx`
- `app/dashboard/crm/campaigns/page.tsx`
- `components/layout/sidebar.tsx`
- `scripts/crm-campaign-worker.cjs`
- `memory.md`

### Architecture / Decisions
- Segment rules are stored as structured JSON in `crm_segments.rules`.
- The worker applies rules server-side before queue creation; the browser never controls recipient selection at send time.
- Complex dynamic/custom-field filtering is intentionally deferred until the contact field strategy is documented.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `node --check scripts/crm-campaign-worker.cjs` passed.
- `npm run build` passed.
- Production build includes `/api/crm/segments` and `/dashboard/crm/segments`.

### Current Status
- Stage 13: Completed.

## 2026-09-19 — Stage 15: CRM Analytics & Command Center

### Objective
Provide company-level and global Superadmin visibility across CRM leads, contacts, campaigns, email delivery, engagement, and website performance.

### Work Completed
- Replaced the campaign-only Analytics page with a CRM Command Center at `/dashboard/crm/analytics`.
- Added All Companies and individual company filters.
- Added clearly labeled campaign rows so global metrics never hide company ownership.
- Added leads today and leads this month metrics.
- Added new contacts this month.
- Added running campaign count.
- Added emails sent and failed email counts.
- Added measured delivery rate and tracked open rate percentages.
- Added clicks and replies totals.
- Added website performance with lead volume per website and company label.
- Added authenticated command-center API at `/api/crm/command-center`.

### Database Changes
- Uses existing CRM companies, websites, leads, contacts, campaigns, campaign messages, and email events.
- No new migration was required.
- No existing Employee/Attendance, `companies`, or `company_accounts` tables were modified.

### Files Changed
- `app/api/crm/command-center/route.ts`
- `app/dashboard/crm/analytics/page.tsx`
- `memory.md`

### Architecture / Decisions
- Global aggregation is explicitly filtered by company ID and returns company-labeled campaign/website rows.
- Delivery and open rates use recorded events only; tracked opens are not presented as guaranteed human reads.
- Existing recipient-level campaign analytics remains available through `/api/crm/analytics`.

### Testing
- `npx tsc --noEmit --pretty false` passed.
- `npm run build` passed.
- Production build includes `/api/crm/command-center` and `/dashboard/crm/analytics`.

### Current Status
- Stage 15: Completed.

