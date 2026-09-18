# New Integration — Multi-Company CRM, Leads, Webmail & Email Marketing

## Purpose

This document is the master implementation plan for adding a new **Business CRM interface** to the existing Digify Employee/Attendance application.

The existing Employee/Attendance system must remain operational and logically separate. The existing `companies` and `company_accounts` tables are also part of the existing application and must **not** be repurposed for CRM mailbox credentials.

The implementation must be completed in stages. The AI coding agent must complete **only one stage at a time**. After a stage is implemented, the human owner will test it and explicitly approve the next stage. The AI agent must not automatically continue to the next stage.

---

# 0. Existing System Baseline — DO NOT BREAK

The current database already contains Employee/Attendance, salary, leave, finance, permissions, notification, device, and account-management tables.

Important existing tables include:

- `employees`
- `attendance`
- `zkteco_sync_logs`
- `devices`
- `profiles`
- `shift_timings`
- `departments`
- `positions`
- `leaves`
- `salaries`
- `salary_deduction_rules`
- `companies`
- `company_accounts`
- `expenses`
- `revenues`
- `permissions`
- `notifications`
- `device_commands`
- `holidays`
- `personal_notes`

The existing `company_accounts` table stores platform login credentials for the current company-account feature. It has `company_id`, `platform_name`, `login`, and encrypted password fields. It must remain separate from CRM email/mailbox credentials.

The existing schema confirms that `companies` currently has only basic company information (`name`, `logo_url`, `notes`, timestamps), while `company_accounts` is a separate credential/account table. Do not assume these existing tables are sufficient for the new CRM architecture.

Reference: existing schema provided with the project. fileciteturn1file0L159-L177

---

# 1. Core Product Architecture

Add a Superadmin sidebar switch:

**Employee Management ↔ Business CRM**

When the Superadmin switches to Business CRM, show a dedicated CRM interface.

Initial CRM navigation:

- CRM Overview
- Companies
- Leads
- Contacts
- Webmail
- Email Templates
- Campaigns
- Automations
- Analytics
- CRM Settings

The CRM must be designed as a multi-company system.

Every CRM record that belongs to a company must be scoped by `company_id`.

The central relationship is:

**Company → Website → Lead → Contact → Email/Conversation → Campaign → Email Events**

---

# STAGE 1 — CRM Shell & Company Management

## Goal

Create the Business CRM interface and the foundation for managing multiple companies.

## Tasks

1. Add the Superadmin CRM switch in the existing sidebar.
2. Create the CRM layout/navigation.
3. Add a Companies page.
4. Add Create Company.
5. Add Edit Company.
6. Add Company Details.
7. Add company logo upload.
8. Add company description/notes.
9. Add website information.
10. Add company status.
11. Ensure only Superadmin can access the CRM foundation initially.

## Company fields

At minimum:

- Company name
- Logo
- Description
- Website URL(s)
- Website technology
- Hosting provider
- Status
- Created at
- Updated at

Do not use hosting provider or website technology as the source of tenant identity. They are metadata only.

## Important

The existing `companies` table is already used by the existing application. Before modifying it, inspect all current code references.

Prefer a safe CRM-specific extension/table design if changing the existing table could affect the existing company-account feature.

## Completion criteria

- Existing dashboard still works.
- CRM switch works.
- Superadmin can add a company.
- Superadmin can edit/view/delete according to the final permission design.
- Multiple companies can exist independently.
- No existing employee/attendance behavior is broken.

STOP after Stage 1.

Human must test and approve Stage 1 before Stage 2.

---

# STAGE 2 — CRM Database Foundation & Company Websites

## Goal

Create proper CRM tenant isolation and website integration records.

## New logical entities

Create CRM-specific tables as appropriate:

- `crm_companies`
- `crm_websites`
- `crm_website_integrations`

If Stage 1 proves that the existing `companies` table can safely be extended without breaking existing functionality, document that decision instead. Do not duplicate company records unnecessarily.

## Website record

A company may have one or more websites.

Suggested fields:

- id
- company_id
- name
- website_url
- technology (`react`, `nextjs`, `php`, `wordpress`, `other`)
- hosting_provider (`hostinger`, `orangehost`, `other`)
- status
- created_at
- updated_at

## Website integration

Each website should have an integration identity.

Suggested fields:

- id
- company_id
- website_id
- integration_name
- public identifier / website ID
- hashed or securely stored secret
- allowed status
- last_received_at
- created_at
- updated_at

Never identify a company only from a URL supplied by a browser.

## Security

Website form submissions must authenticate to the ingestion API using a website-specific credential.

Do not expose Supabase service-role credentials in React, PHP, or other public website code.

## Completion criteria

- One company can have multiple websites.
- React, Core PHP, Next.js, and other sites can all be represented.
- Each website has its own integration identity.
- CRM records are company-scoped.
- No cross-company access is possible through normal CRM queries.

STOP and wait for human approval.

---

# STAGE 3 — Website Lead Ingestion API

## Goal

Allow external company websites to send form submissions into the correct company's CRM.

## Flow

Website form:

**Website → authenticated CRM API → validation → company/website lookup → lead creation → Supabase**

## API

Create a dedicated lead ingestion endpoint, for example:

`POST /api/crm/integrations/leads`

The exact route may be adjusted to project conventions.

## Request

Support flexible form payloads such as:

- name
- email
- phone
- message
- form name
- source page
- custom fields

The API must tolerate different website technologies.

## Required validation

- Authenticate integration.
- Validate required fields.
- Normalize email.
- Validate email format where appropriate.
- Reject malformed requests.
- Add company ID and website ID from the authenticated integration.
- Record source website/form.
- Prevent unauthorized company spoofing.

## Lead table

Suggested fields:

- id
- company_id
- website_id
- name
- email
- phone
- message
- form_name
- source_url
- status
- custom_data JSONB
- created_at
- updated_at

Suggested statuses:

- new
- contacted
- qualified
- converted
- lost

## Duplicate handling

Do not blindly delete duplicates.

Implement a documented duplicate strategy. Initially, duplicate detection may use company + normalized email, while allowing legitimate repeated inquiries to remain distinguishable if necessary.

## Completion criteria

Test with:

1. React-style POST request.
2. Core PHP/cURL-style POST request.
3. Invalid token.
4. Missing required fields.
5. Company A integration sending data.
6. Company B integration sending data.

Company A's lead must never appear under Company B.

STOP and wait for human approval.

---

# STAGE 4 — CRM Leads Interface & Contact Conversion

## Goal

Show website leads inside each company's CRM and allow lead management.

## Leads page

Provide:

- All leads
- New
- Contacted
- Qualified
- Converted
- Lost
- Search
- Filters
- Date filter
- Website filter
- Status filter

## Lead detail

Show:

- Name
- Email
- Phone
- Message
- Source website
- Form
- Source URL
- Created time
- Status
- Notes
- Activity timeline

Actions:

- Change status
- Add note
- Send email
- Convert to contact

## Contact conversion

A converted lead should create/link a CRM contact without creating uncontrolled duplicates.

Preserve the original lead record.

## Completion criteria

- Leads are visible under the correct company.
- Filters work.
- Lead detail works.
- Status updates work.
- Contact conversion works.
- Existing dashboard is unaffected.

STOP.

---

# STAGE 5 — CRM Contacts & Import System

## Goal

Create the central contact database used by email marketing.

## Contact fields

At minimum:

- id
- company_id
- first_name
- last_name
- full_name
- email
- phone
- status
- source
- custom_data
- created_at
- updated_at

## Contact management

Support:

- Add manually
- Edit
- Delete/archive
- Search
- Filter
- Tags
- Contact detail

## CSV/Excel import

Admin can upload contact files.

Import flow:

1. Upload.
2. Parse.
3. Preview.
4. Validate.
5. Detect duplicates.
6. Show invalid rows.
7. Confirm import.
8. Import valid rows.
9. Show result summary.

Result example:

- Total rows
- Imported
- Duplicates
- Invalid
- Failed

Do not silently discard invalid records.

## Completion criteria

Manual contacts and file imports work.

STOP.

---

# STAGE 6 — Webmail Mailbox Connections

## Goal

Connect company webmail accounts hosted on providers such as Hostinger and OrangeHost.

## Architecture

Use mailbox protocols rather than embedding a hosting provider's webmail page.

Incoming:

**Mailbox → IMAP → CRM mail sync → database → CRM Webmail**

Outgoing:

**CRM → SMTP → mailbox/provider → recipient**

## Mailbox table

Create a CRM-specific mailbox table, for example:

`crm_mailboxes`

Suggested fields:

- id
- company_id
- email_address
- display_name
- provider
- IMAP host
- IMAP port
- IMAP security
- SMTP host
- SMTP port
- SMTP security
- encrypted credentials / secret reference
- status
- last_sync_at
- created_at
- updated_at

Exact credential storage must follow the application's existing server-side encryption/security pattern.

Never expose mailbox passwords to browser JavaScript.

Never store mailbox passwords in plaintext.

## Mailbox features

- Connect mailbox
- Test connection
- Disconnect
- Sync status
- Last sync
- Multiple mailboxes per company

Example:

Exam Takers Hub:

- info@...
- admissions@...
- support@...

## Completion criteria

A test mailbox can:

- connect through IMAP
- sync inbound mail
- send a test message through SMTP
- report connection errors clearly

STOP.

---

# STAGE 7 — CRM Webmail Interface

## Goal

Build a webmail experience inside the CRM.

## Features

Folders:

- Inbox
- Sent
- Drafts
- Starred
- Archive
- Trash
- Spam

Features:

- Search
- Open message
- Reply
- Reply all
- Forward
- Compose
- Attachments
- Mark read/unread
- Star
- Archive
- Delete

## Threads

Emails should be grouped into conversations where possible.

Suggested entities:

- `crm_email_threads`
- `crm_email_messages`
- `crm_email_attachments`

Store provider message identifiers and threading metadata where available.

## Contact linking

If an incoming email matches a CRM contact, link it automatically.

If no contact exists, offer:

**Create Contact**

## Completion criteria

Admin can use the CRM to read and send mailbox email.

STOP.

---

# STAGE 8 — Email Templates

## Goal

Create reusable marketing and operational email templates.

## Template features

- Template name
- Company
- Subject
- HTML/body content
- Plain-text fallback where possible
- Variables
- Status
- Created/updated timestamps

Example variables:

`{{first_name}}`

`{{last_name}}`

`{{email}}`

`{{company_name}}`

Do not render untrusted variables as executable HTML.

## Editor

Provide a practical email template editor.

Start with a reliable HTML/text editor. A visual drag-and-drop builder can be added later if needed.

## Preview

Allow:

- Desktop preview
- Mobile preview
- Test email

## Completion criteria

Admin can create, edit, duplicate, preview, and test templates.

STOP.

---

# STAGE 9 — Campaign Builder

## Goal

Create campaigns that target contacts/segments and use templates.

## Campaign fields

- Company
- Name
- Audience/segment
- From mailbox
- Reply-to
- Subject/template
- Schedule
- Sending mode
- Status

Statuses:

- draft
- scheduled
- running
- paused
- completed
- cancelled
- failed

## Campaign workflow

1. Select company.
2. Select audience.
3. Select sender mailbox.
4. Select/create template.
5. Preview.
6. Test send.
7. Configure schedule.
8. Configure sending interval/batch.
9. Review.
10. Schedule.

Do not start sending immediately from the browser.

STOP.

---

# STAGE 10 — Email Queue & Sending Engine

## Goal

Build reliable background sending.

The browser must NOT be responsible for maintaining the campaign sending loop.

Use a persistent queue.

Suggested entities:

- `crm_campaign_contacts`
- `crm_campaign_messages`

Message statuses:

- queued
- processing
- sent
- delivered
- failed
- bounced
- opened
- clicked
- replied
- unsubscribed

## Scheduling

Support settings such as:

**Fixed interval**

Example:

1 email every 3 minutes.

Also support a configurable batch model such as:

10 emails every 5 minutes.

The interval must be configurable and must not be hard-coded.

## Worker

Use an appropriate server-side worker/scheduled process.

The worker should:

1. Find due queue records.
2. Claim records safely.
3. Prevent duplicate processing.
4. Send email.
5. Save provider/message ID.
6. Save success/failure.
7. Retry eligible failures.
8. Respect campaign pause/cancel state.
9. Continue from the queue after restart.

## Concurrency

Implement claiming/locking so two workers cannot send the same queue record simultaneously.

## Completion criteria

Test:

- 1 email
- 10 emails
- interval sending
- worker restart
- temporary failure
- permanent failure
- campaign pause
- campaign cancel

STOP.

---

# STAGE 11 — Delivery, Open, Click & Error Tracking

## Goal

Provide campaign analytics.

Track events where the selected email delivery system supports them:

- sent
- delivered
- bounced
- failed
- opened
- clicked
- complained, where available
- unsubscribed

Suggested entity:

`crm_email_events`

Store:

- campaign_message_id
- event type
- provider event ID
- event time
- metadata

## Dashboard

Show:

- Total recipients
- Sent
- Pending
- Failed
- Delivered
- Bounced
- Opens
- Clicks
- Replies
- Unsubscribes

## Recipient drill-down

Admin can click:

**Opened**

and see which contacts have recorded an open event.

Important: open tracking is not perfectly reliable because email clients may block or proxy tracking pixels.

Do not present tracked opens as guaranteed human reads.

## Error reporting

Every failed message should expose a useful reason when available.

Example:

- Invalid recipient
- SMTP error
- Provider rejection
- Mailbox unavailable
- Rate limit
- Timeout

STOP.

---

# STAGE 12 — Reply Sync & Unified Contact Timeline

## Goal

Connect campaign activity and normal webmail into a unified contact history.

## Contact timeline

Example events:

- Website form submitted
- Lead created
- Contact created
- Campaign email sent
- Email delivered
- Email opened
- Link clicked
- Contact replied
- Admin replied
- Lead status changed
- Note added

## Reply matching

Incoming mailbox email should be matched to the correct thread/contact using:

- Message-ID
- In-Reply-To
- References
- thread/provider identifiers
- sender email as fallback

Do not rely only on subject text.

## Completion criteria

A website lead/contact can have one timeline containing both CRM and email activity.

STOP.

---

# STAGE 13 — Segments & Advanced Campaign Audiences

## Goal

Allow administrators to create reusable audiences.

Examples:

- All leads
- UK leads
- Customers
- Not contacted
- Previous customers
- Leads from a specific website

Support rule-based filtering.

Example:

Country = UK
AND
Status = Lead

The exact contact fields and custom-field strategy must be documented before implementing complex dynamic filters.

STOP.

---

# STAGE 14 — Automation Builder

## Goal

Move from one-time campaigns to automated workflows.

Example:

**Trigger: New Website Lead**

→ Add contact/tag

→ Send Email 1

→ Wait 2 days

→ If opened, send Email 2

→ Otherwise send Reminder

→ If replied, stop automation

## Automation entities

Potentially:

- `crm_automations`
- `crm_automation_steps`
- `crm_automation_runs`

## Requirements

- Trigger
- Conditions
- Actions
- Delay/wait
- Branching
- Stop conditions
- Retry/error state
- Run history

Do not build an unnecessarily complex visual workflow editor initially. Start with a reliable structured workflow model and add visual editing after the engine is proven.

STOP.

---

# STAGE 15 — CRM Analytics & Command Center

## Goal

Create company-level and global Superadmin analytics.

## Company dashboard

Show:

- Leads today
- Leads this month
- New contacts
- Campaigns running
- Emails sent
- Delivery rate
- Tracked open rate
- Clicks
- Replies
- Failed emails
- Website performance

## Global Superadmin view

Show aggregated information across companies while maintaining company filters.

Example:

Company selector:

**All Companies / Exam Takers Hub / Company B / Company C**

Never combine records without clear company labels.

STOP.

---

# STAGE 16 — CRM Security, RLS & Audit

## Goal

Harden the system before production use.

## Security

Review:

- Authentication
- Superadmin authorization
- Server-only secrets
- Mailbox credentials
- Website integration secrets
- API authentication
- Input validation
- Rate limiting
- CSRF/security requirements where applicable
- File upload validation
- HTML email sanitization
- SQL/RLS boundaries

## RLS

Every company-scoped CRM table must have appropriate Row Level Security or be accessed only through secure server-side APIs with equivalent authorization controls.

The server/service role must never be exposed to external websites or browsers.

## Audit log

Add a CRM audit trail for sensitive actions.

Example:

Admin changed campaign status:
`scheduled → paused`

Admin changed a lead:
`new → contacted`

Admin connected mailbox:
`info@company.com`

STOP.

---

# STAGE 17 — Production Reliability & Monitoring

## Goal

Make the system operationally reliable.

Monitor:

- Worker health
- Queue backlog
- Failed messages
- Mailbox sync errors
- Website integration errors
- API failures
- Database errors
- Campaign state
- Last successful sync
- Retry counts

Provide clear admin diagnostics.

Example:

**Email Worker: Online**

**Queue: 42 pending**

**Mailbox Sync: Healthy**

**Last Sync: 18 Sep 2026 18:40**

STOP.

---

# STAGE 18 — Final Integration Testing

## Test Matrix

### Company isolation

- Company A cannot see Company B leads.
- Company A cannot see Company B contacts.
- Company A cannot access Company B mailboxes.
- Company A cannot access Company B campaigns.

### Website integrations

Test:

- React
- Core PHP
- Next.js
- Invalid credentials
- malformed requests
- duplicate submissions

### Mail

Test:

- IMAP connection
- SMTP connection
- incoming mail
- outgoing mail
- reply
- attachments
- failed mail
- reconnect
- multiple mailboxes

### Campaigns

Test:

- draft
- schedule
- send
- interval
- pause
- resume
- cancel
- retry
- failure
- completion

### Existing application

Regression-test:

- Employee login
- Superadmin login
- Attendance
- ZKTeco sync
- Manual attendance
- Salary
- Leave
- Company accounts
- Finance
- Permissions

The existing attendance architecture must continue to use its central calculation engine and must not be replaced by CRM logic.

STOP.

---

# STAGE APPROVAL RULE

This rule is mandatory for the AI coding agent:

1. Read this file before making changes.
2. Read `memory.md` before making changes.
3. Identify the current stage.
4. Implement ONLY that stage.
5. Test ONLY the relevant completed functionality plus regression checks.
6. Update `memory.md`.
7. Report exactly what was changed.
8. STOP.
9. Do not begin the next stage until the human explicitly says the current stage is approved and asks to continue.

Never assume approval from silence.

Never implement future stages early "because they are required."

---

# MEMORY.MD UPDATE RULE

After completing every stage, open the existing `memory.md` file and append a new entry at the **very bottom**.

Use the actual current date at the time of work.

Format:

## YYYY-MM-DD — Stage X: <Stage Name>

### Objective
What this stage was intended to accomplish.

### Work Completed
- Exact changes made.
- Exact features implemented.

### Database Changes
- Tables created/modified.
- Columns/indexes/RLS/policies added.
- Migrations created.

### Files Changed
- List important files.

### Architecture / Decisions
- Important implementation decisions.
- Why a particular approach was chosen.

### Integration Details
- APIs/endpoints.
- External services.
- Environment variables, without exposing secret values.

### Testing
- Tests performed.
- Manual checks performed.
- Results.

### Problems / Errors
- Any errors encountered.
- How they were resolved.
- Any unresolved issue.

### Current Status
- Stage status: Completed / Partially Completed / Blocked.

### Next Step
State the next stage only as a pending next step. Do not implement it until explicitly approved.

Do not overwrite old memory entries.

Do not delete previous entries.

Do not store secrets, passwords, API keys, service-role keys, mailbox passwords, or tokens in `memory.md`.

---

# NON-NEGOTIABLE DEVELOPMENT RULES

1. Preserve the existing Employee/Attendance application.
2. Do not merge CRM mailbox credentials into `company_accounts`.
3. Do not expose secrets in browser/client code.
4. Do not expose Supabase service-role credentials to external websites.
5. Every CRM company-owned record must have a reliable company relationship.
6. External website integrations must authenticate.
7. Never trust a company ID supplied by an unauthenticated public form.
8. Use server-side validation for all integrations.
9. Use database constraints and indexes where appropriate.
10. Prevent cross-company data access.
11. Campaign sending must run through a persistent queue/worker, not a browser loop.
12. Queue processing must be idempotent/concurrency-safe.
13. Store provider IDs/events needed for tracking and reconciliation.
14. Mailbox credentials must be encrypted or stored through a secure secret-management mechanism.
15. Do not store secrets in source control.
16. Do not put secrets in `memory.md`.
17. Do not silently change existing attendance behavior.
18. Before modifying an existing table, inspect its current application usage.
19. Run production build/type checks after meaningful code changes.
20. Document important architecture decisions in `memory.md`.
21. Do not continue to another stage without explicit human approval.

---

# INITIAL IMPLEMENTATION ORDER

The required order is:

**Stage 1**
CRM Shell & Company Management

↓

**Stage 2**
CRM Database Foundation & Company Websites

↓

**Stage 3**
Website Lead Ingestion API

↓

**Stage 4**
CRM Leads & Contact Conversion

↓

**Stage 5**
Contacts & Import

↓

**Stage 6**
Webmail Connections

↓

**Stage 7**
Webmail Interface

↓

**Stage 8**
Email Templates

↓

**Stage 9**
Campaign Builder

↓

**Stage 10**
Email Queue & Sending Engine

↓

**Stage 11**
Tracking & Analytics

↓

**Stage 12**
Reply Sync & Unified Timeline

↓

**Stage 13**
Segments

↓

**Stage 14**
Automations

↓

**Stage 15**
Analytics Command Center

↓

**Stage 16**
Security & Audit

↓

**Stage 17**
Production Reliability

↓

**Stage 18**
Final Integration Testing

---

# IMPORTANT CURRENT CONTEXT

The project already has a functioning Next.js + Supabase architecture and an office-side ZKTeco worker. The CRM is an additional Superadmin-facing business system, not a replacement for the existing employee/attendance system.

The current attendance database uses separate punch rows and a centralized attendance calculation engine. CRM implementation must not modify that behavior unless a future task explicitly requires it.

The current `companies` and `company_accounts` functionality is not the CRM mailbox system. Keep the distinction explicit throughout implementation.

