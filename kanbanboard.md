# TASK: Replace the Existing Notes & Reminders Module with a Next-Generation Kanban Task Management System

## 1. Project Context

You are working inside my existing CRM application.

The CRM currently has a basic Notes and Reminders feature where administrators and employees can create their own notes and receive reminders.

I want to replace this basic experience with a complete, production-ready **Task Management System** featuring a premium Kanban board, task assignment, collaboration, employee progress tracking, activity history, calendar views, analytics, and advanced filtering.

This is a modification of an existing CRM, NOT a new standalone application.

### First, inspect the existing codebase

Before writing code:

* Identify the current framework, routing structure, UI component library, styling system, authentication, database, ORM, and existing migration system.
* Locate the existing Notes and Reminders pages, components, API routes, database tables, and relationships.
* Inspect how administrators, employees, roles, permissions, and employee IDs are represented.
* Understand the existing CRM layout, sidebar, header, theme, and design conventions.
* Identify reusable components, existing notification services, and file upload infrastructure.
* Check the existing task or notes-related data and how reminders are currently processed.
* Determine how the current application handles timezones, dates, and audit logs.

**Do not assume a technology stack or invent existing schema names. Discover them from the repository.**

Preserve the existing authentication, navigation, layout, shared components, and unrelated CRM features.

## 2. Replace the Existing Module

Remove the old Notes and Reminders experience from the active user interface and replace it with a new module called:

**Tasks & Projects**

The existing navigation item should be updated rather than creating confusing duplicate menu entries.

Old notes and reminders must not be silently deleted. Inspect existing records and determine whether they can be migrated into tasks while preserving their authors, timestamps, reminder dates, ownership, and relevant content.

If automatic conversion is unsafe or semantically incorrect, create a documented archival or compatibility strategy.

The migration must be reversible where practical and must never drop existing data simply to simplify implementation.

## 3. Premium UI/UX Requirements

Build a genuinely polished, modern SaaS task management interface inspired by the interaction quality of Linear, ClickUp, and Notion, without copying their branding or exact layouts.

The interface should feel premium, fast, sophisticated, and satisfying to use.

### Visual direction

* Clean, premium CRM interface with excellent visual hierarchy.
* Follow the existing CRM brand and theme.
* Use consistent typography, spacing, border radii, shadows, and iconography.
* Support desktop, tablet, and mobile layouts.
* Provide tasteful animations and transitions without making the application sluggish.
* Use compact but readable cards with strong information density.
* Include polished empty states, loading skeletons, error states, and success feedback.
* Support dark mode if the existing CRM supports it.
* Avoid excessive gradients, childish colors, giant cards, unnecessary whitespace, and decorative clutter.

### Main page layout

Create a complete task workspace containing:

1. Page title and contextual description.
2. Prominent Create Task button.
3. Search input.
4. Board, List, and Calendar view switcher.
5. Filter and sorting controls.
6. Saved views.
7. Quick date-range selectors.
8. Task status and workload summary.
9. Optional team or assignee selector, based on permissions.
10. A responsive task workspace.

Make the interface highly usable even when there are hundreds or thousands of tasks.

## 4. Kanban Board

Create a fully functional drag-and-drop Kanban board.

Default columns:

1. To Do
2. In Progress
3. Approved
4. Done

The interface should allow horizontal scrolling between columns while keeping the board readable.

### Task cards

Each card should be capable of displaying:

* Task title.
* Short description preview.
* Priority indicator.
* Status.
* Assignee avatar and name.
* Creator information where useful.
* Due date and overdue indicator.
* Project or category.
* Labels and tags.
* Comment count.
* Attachment count.
* Checklist completion progress.
* Subtask progress.
* Recurring-task indicator where applicable.
* Last activity or update time.

Use subtle visual indicators rather than displaying every property on every card.

Clicking a card should open a detailed task drawer or modal without unnecessarily losing the user's board context.

### Drag-and-drop functionality

* Move tasks between statuses.
* Reorder tasks within a column.
* Update the database only after a valid operation.
* Persist ordering across refreshes and sessions.
* Handle optimistic UI updates and rollback if a request fails.
* Enforce status-transition and permission rules on the server.
* Record status changes in the activity history.
* Support keyboard accessibility where practical.
* Prevent duplicate or inconsistent updates during concurrent operations.

The board must work with real persisted data, not mock tasks.

## 5. Task Creation and Assignment

Create a comprehensive task creation form.

Required or configurable fields:

* Task title.
* Description with rich-text support if compatible with the existing stack.
* Status.
* Priority: Low, Medium, High, Urgent.
* Creator.
* One or more assignees if supported by the permission model.
* Start date.
* Due date and optional due time.
* Project or category.
* Labels.
* Checklist items.
* Parent task and subtasks.
* Reminder date and time.
* Recurrence settings.
* Estimated effort or duration.
* Optional custom fields if the existing architecture can support them cleanly.

Validate due dates, assignments, required fields, and other constraints on the server.

### Admin capabilities

An administrator must be able to:

* Create tasks for themselves.
* Create tasks and assign them to employees.
* Assign tasks to multiple employees if supported by the chosen design.
* Reassign tasks.
* Set deadlines and priorities.
* Edit task details.
* Review employee task progress.
* View relevant team activity and task history.
* Filter tasks by employee, status, project, priority, deadline, and completion.
* Access the team calendar and permitted employee task details.
* Identify overdue tasks and blocked work.
* Archive tasks according to retention rules.

### Employee capabilities

An employee must be able to:

* Create personal tasks.
* Create tasks for themselves.
* View tasks assigned to them.
* View their own created tasks, including tasks awaiting assignment, according to the access model.
* Update permitted fields on assigned tasks.
* Move tasks through permitted workflow statuses.
* Add comments and attachments where authorized.
* Create checklists and subtasks where authorized.
* Update progress.
* View their personal task history and calendar.
* Set personal filters and saved views.
* Receive reminders and relevant notifications.

An employee must not automatically gain access to all other employees' private tasks or internal administrative notes.

Define explicit permission rules for tasks created by employees, tasks assigned by administrators, and tasks shared with multiple employees.

## 6. Task Detail Drawer

Build a detailed, well-organized task drawer or full-screen mobile detail page.

Include the following sections or tabs:

### Overview

* Title and description.
* Status and priority.
* Creator and assignees.
* Start and due dates.
* Project, labels, and custom fields.
* Checklist and subtasks.
* Completion progress.
* Reminder settings.

### Comments and Collaboration

* Add comments.
* Edit or delete one's own comments according to permissions.
* Display author avatar, name, and timestamp.
* Support threaded replies if practical.
* Mention team members using @mentions.
* Notify relevant participants about mentions.
* Display comment history where appropriate.
* Prevent unauthorized access to comments and attachments.

### Activity History

Display a chronological audit timeline showing events such as:

* Task created.
* Task assigned or reassigned.
* Status changed.
* Priority changed.
* Deadline modified.
* Description or important fields edited.
* Comment added.
* Attachment uploaded or removed.
* Checklist updated.
* Task completed or reopened.
* Task archived or restored.

Each event should include the actor, timestamp, and relevant before/after values where appropriate.

Activity history must be generated by trusted server-side operations. Users must not be able to fabricate audit events by submitting arbitrary client data.

### Attachments

If supported by existing infrastructure, allow authorized users to upload and access task attachments securely. Validate file types, sizes, permissions, and download access.

### Related Tasks

Show parent tasks, subtasks, dependencies, and related tasks when applicable.

## 7. Calendar View

Add a prominent Calendar button or view switcher.

The calendar must use the same underlying tasks and filters as the Kanban board.

Provide:

* Month view.
* Week view.
* Day view where practical.
* Upcoming deadlines.
* Overdue tasks.
* Start dates and due dates.
* Task priority indicators.
* Assignee identification.
* Click-to-open task details.
* Drag-and-drop rescheduling where practical.
* Clear timezone handling.
* Previous and next period navigation.
* A Today button.
* Date-range filtering.

### Employee calendar

Employees should be able to see their own relevant tasks, deadlines, and permitted shared tasks.

### Administrator calendar

Administrators should be able to inspect their own tasks and authorized employee tasks.

Provide filters for employee, team, project, status, priority, and date range.

Avoid exposing unrelated personal or restricted tasks simply because an administrator can open the calendar. Respect the actual CRM permission model and documented administrator access rules.

If the existing application has a reliable calendar component, reuse it where suitable rather than introducing a second library unnecessarily.

## 8. Advanced Filtering, Search, and Sorting

Implement real, combinable filters rather than decorative dropdowns.

Include filters for:

* Status.
* Priority.
* Assignee.
* Creator.
* Team or department, if available.
* Project or category.
* Labels.
* Created date.
* Start date.
* Due date.
* Overdue tasks.
* Completed tasks.
* Incomplete tasks.
* Archived tasks.
* Tasks with no assignee.
* Tasks with no due date.
* Tasks with comments.
* Tasks with attachments.
* Tasks with subtasks.
* Tasks awaiting approval.
* Tasks updated recently.
* Recurring tasks.
* Completion progress.
* Current user.
* Specific employees, subject to permissions.

Support AND/OR filtering where it provides meaningful value and is practical to implement.

Additional requirements:

* Search by task title and relevant description text.
* Debounce search requests.
* Sort by due date, priority, creation date, updated date, title, and completion.
* Support ascending and descending order.
* Provide Clear All Filters.
* Display active filters as removable chips.
* Preserve filters when switching between Board, List, and Calendar views.
* Support pagination or efficient server-side loading for large datasets.
* Persist user-specific saved views.
* Allow users to rename and delete their saved views.
* Provide useful default views such as My Tasks, Assigned by Me, Overdue, Due Today, Upcoming, Completed, and Team Tasks where permissions allow.

Filter counts and task totals must reflect the actual filtered dataset.

## 9. Progress Tracking and Analytics

Add a useful task overview dashboard without turning the page into an unreadable wall of charts.

Include metrics such as:

* Total tasks.
* Tasks completed.
* Tasks in progress.
* Tasks awaiting approval.
* Overdue tasks.
* Tasks due today.
* Completion percentage.
* Completion trends over time.
* Tasks completed within their deadlines.
* Average completion duration where meaningful.
* Workload by employee.
* Open tasks by priority.
* Tasks created versus completed over time.
* Employee-specific progress.
* Project-specific progress.

Administrators should be able to view team-level analytics and permitted employee-level information.

Employees should see their own progress and any team metrics explicitly permitted by the CRM's authorization model.

### Historical accuracy

Do not calculate all historical completion statistics using only the current task status.

For example, a task that is currently Done may have been completed, reopened, and completed again.

Use appropriate historical events or status-transition records to calculate completion trends and historical status counts accurately.

Define the completion percentage formula clearly. Do not invent a percentage from arbitrary task fields.

If time tracking or estimated hours are not currently supported, do not claim to provide actual time-spent metrics.

## 10. Notifications and Reminders

Integrate with the existing CRM notification and reminder system wherever possible.

Support notifications for:

* New task assignment.
* Task reassignment.
* Mention in a comment.
* New comment on a relevant task.
* Deadline approaching.
* Task overdue.
* Approval requested.
* Task approved or rejected.
* Task completed.
* Task reopened.
* Significant deadline changes.

Allow appropriate user notification preferences and avoid sending duplicate notifications.

Use the existing reliable delivery infrastructure. Do not introduce an unsupported background worker or pretend scheduled reminders will execute without a functioning scheduler.

If the current system uses scheduled jobs, inspect their reliability and reuse them. Otherwise, implement a scheduler compatible with the actual hosting environment and document the deployment requirements.

Store timestamps consistently and display them in the appropriate user timezone, using the CRM's existing timezone conventions.

## 11. Workflow and Approval

The default workflow is:

To Do → In Progress → Approved → Done

Define the meaning of each status clearly.

* To Do: Work has not started.
* In Progress: Work is underway.
* Approved: The task or deliverable has passed the required approval step.
* Done: The task is considered fully complete.

Support configurable transitions if practical, but preserve a simple default workflow.

Where approval is required, employees must not be able to bypass the approval step through direct API calls, drag-and-drop requests, or modified browser requests.

If the business workflow requires an administrator to approve a deliverable before it becomes Done, enforce that requirement on the server.

Do not force every task to require approval if the task does not need it. Use an explicit approval-required setting or a clearly defined workflow configuration.

Support reopening completed tasks with an appropriate audit event.

## 12. Projects, Labels, Subtasks, and Recurrence

Implement these capabilities using a maintainable data model.

### Projects

* Create and manage projects or task groups.
* Assign project owners where applicable.
* Associate tasks with projects.
* Filter the board by project.
* Display project-level progress.

### Labels

* Create reusable labels.
* Assign multiple labels to tasks.
* Filter and search by labels.
* Restrict label administration appropriately.

### Subtasks and checklists

* Create child tasks.
* Track completion independently.
* Show parent task progress.
* Prevent circular task relationships.
* Define how child completion affects parent completion.

### Recurring tasks

Support reasonable recurrence patterns such as daily, weekly, monthly, and custom intervals if practical.

Generate future instances idempotently. Do not duplicate recurring tasks when a scheduled job runs twice.

Clearly define whether editing a recurring task affects the current instance, future instances, or the entire series.

## 13. Database Design and Migration

Inspect the existing database before designing migrations.

Create the necessary schema changes using the repository's actual database technology and migration framework.

The design may require tables or equivalent models for:

* Tasks.
* Task assignments.
* Task comments.
* Task activity history.
* Task attachments and metadata.
* Task labels.
* Task-label relationships.
* Projects.
* Checklists and checklist items.
* Subtasks and dependencies.
* Task reminders.
* Saved views.
* Workflow configuration.
* Notification delivery records.
* Recurrence configuration.
* Status transition history, if not represented adequately by the activity history.

Do not create every table blindly. Consolidate models where appropriate and avoid redundant data.

### Data integrity

Implement:

* Foreign keys where supported.
* Appropriate indexes.
* Unique constraints where required.
* Referential integrity.
* Transactions for multi-step operations.
* Safe deletion and archival rules.
* Efficient queries for board and calendar views.
* Server-side validation.
* Tenant or organization isolation if the CRM supports multiple organizations.

Prevent orphaned assignments, comments, labels, and activity records.

### Legacy data migration

Before modifying the existing Notes and Reminders schema:

1. Identify all relevant legacy tables and relationships.
2. Determine which existing records can safely become tasks.
3. Preserve original content, creator, owner, timestamps, and reminder dates.
4. Preserve a stable mapping between legacy records and migrated tasks.
5. Avoid duplicate imports when the migration is retried.
6. Document records that cannot be converted safely.
7. Provide rollback or recovery guidance.
8. Never delete original records before verifying the migration results.

If legacy notes do not map cleanly to tasks, retain them in an archive or compatibility table until their disposition is explicitly approved.

### Migration deliverables

Create:

* Complete forward migration.
* Rollback migration where feasible.
* Legacy data conversion script if necessary.
* Required indexes and constraints.
* Seed data only where appropriate for development or tests.
* A migration README explaining execution, prerequisites, backups, verification, and rollback.
* A schema summary showing each new or modified table and its purpose.

**IMPORTANT: Do not apply migrations to my live database automatically.**

Prepare the migration files and instructions for me to review and execute manually. Do not run destructive schema commands, delete production data, or modify production records without my explicit authorization.

If the project has an established migration workflow, follow it rather than inventing a parallel system.

## 14. API, Security, and Permissions

Implement production-grade backend operations for creating, viewing, editing, assigning, commenting on, filtering, and completing tasks.

Enforce permissions on every relevant server-side operation.

Do not rely on hiding buttons in the frontend for security.

Requirements:

* Verify the authenticated user on every protected request.
* Validate task ownership, assignment, organization, and permitted access.
* Prevent employees from changing their own roles or elevating their privileges.
* Prevent unauthorized access through guessed task IDs.
* Validate status transitions server-side.
* Validate uploaded files.
* Protect against injection, cross-site scripting, and unauthorized object access.
* Use safe database queries.
* Apply rate limits to sensitive or abuse-prone operations where appropriate.
* Keep credentials and secrets server-side.
* Avoid logging passwords, tokens, or sensitive task content.
* Use transactions where consistency requires them.
* Prevent duplicate assignment and duplicate recurring-task creation.
* Preserve audit history for security-sensitive changes.

If the CRM is multi-tenant, ensure all queries and mutations enforce organization boundaries.

## 15. Performance and Reliability

The feature must remain responsive with large task datasets.

* Use server-side filtering, sorting, and pagination when appropriate.
* Add indexes based on actual query patterns.
* Avoid N+1 queries.
* Avoid fetching the complete task history for every board card.
* Load comments, attachments, and full activity details when needed.
* Keep drag-and-drop operations efficient.
* Debounce search and avoid unnecessary rerenders.
* Use caching only where invalidation remains reliable.
* Handle concurrent edits gracefully.
* Display meaningful errors and retry options.
* Do not silently discard unsaved changes.
* Ensure the board, list, and calendar views remain consistent after updates.

## 16. Testing Requirements

Write and run tests appropriate to the existing project.

Cover at least:

* Task creation and editing.
* Admin assignment to employees.
* Employee task creation.
* Permission enforcement.
* Unauthorized task access.
* Status transitions.
* Approval enforcement.
* Drag-and-drop persistence.
* Filtering and search.
* Comments and mentions.
* Activity history.
* Calendar date handling.
* Reminder scheduling.
* Recurring-task idempotency.
* Legacy migration integrity.
* Duplicate requests and concurrent updates.
* Empty states and error handling.

Run the existing lint, type-check, test, and production build commands where available.

Fix regressions introduced by this implementation. Clearly report any tests that could not be run and why.

Do not claim that something works merely because the UI renders.

## 17. Implementation Strategy

Work in the following sequence:

Phase 1: Inspect the codebase, database schema, existing module, authentication, and permissions.

Phase 2: Document the proposed architecture, workflow, database changes, legacy-data handling, and implementation plan.

Phase 3: Implement the backend schema, migration files, validation, authorization, and task APIs.

Phase 4: Build the premium Kanban interface and task detail drawer.

Phase 5: Implement assignment, comments, activity history, filters, saved views, and list view.

Phase 6: Implement calendar, reminders, notifications, analytics, and advanced workflow features.

Phase 7: Add automated tests, accessibility improvements, responsive behavior, and performance optimizations.

Phase 8: Run verification and provide deployment and manual migration instructions.

Do not stop after producing a plan. After inspecting and documenting the architecture, proceed with implementation unless an actual blocker or an irreversible decision requires my input.

If the task is too large for one uninterrupted pass, prioritize a complete, secure, functional core and continue through the remaining phases. Do not replace implementation with mockups or placeholder buttons.

## 18. Final Deliverables

At the end, provide:

1. Summary of the old module and how it was replaced.
2. List of created and modified files.
3. Database schema changes.
4. Forward and rollback migration file locations.
5. Explanation of legacy notes and reminder preservation.
6. New features implemented.
7. Admin versus employee permission matrix.
8. API routes or server actions added.
9. Tests executed and their actual results.
10. Known limitations or unfinished features.
11. Exact commands for local validation.
12. Exact instructions for manually reviewing and applying the database migration.
13. Production deployment instructions.
14. Backup and rollback procedure.
15. Any environment variables or scheduled jobs required.

### Final acceptance criteria

The implementation is complete only when:

* The old Notes and Reminders interface has been replaced in the active CRM navigation.
* Existing legacy data remains recoverable.
* Admins can create personal tasks and assign tasks to employees.
* Employees can create and manage permitted tasks.
* Kanban, List, and Calendar views use consistent real database data.
* Drag-and-drop changes persist.
* Comments, attachments, and activity history work with enforced permissions.
* Search, advanced filters, sorting, and saved views work.
* Employee progress and administrative analytics use real data.
* Reminders and notifications use a functioning delivery mechanism.
* Migrations are prepared but not applied to production automatically.
* Security checks, tests, and build verification have been performed and honestly reported.

Build this as a coherent, maintainable CRM feature, not a collection of disconnected screens.

Inspect first. Preserve existing data. Enforce permissions on the server. Implement the complete feature. Verify before claiming success.
