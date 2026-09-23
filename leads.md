# Business CRM - Leads, Experts & Orders Implementation Task

## 1. Task Objective

Implement a complete upgrade of the existing Business CRM lead workflow.

The existing CRM already supports:

- Website integrations that receive leads.
- Lead validation and normalization.
- Company and website identification through the integration.
- Duplicate lead detection/flagging without blocking the new lead.
- Lead statuses: `new`, `contacted`, `qualified`, `converted`, `lost`.
- Lead notes.
- Manual lead-to-contact conversion.
- Contacts, contact timelines, tags, imports and email campaigns.

This task adds:

1. Manual lead creation.
2. Lead edit and soft-delete/trash functionality.
3. Permanent lead deletion from Trash.
4. A dedicated Lead Profile page instead of a basic popup.
5. Experts management.
6. Order creation directly from a lead.
7. Order creation from the Orders module.
8. Writing-specific optional order fields.
9. Order management and completion status.
10. Complete order history inside the Lead Profile.
11. Proper database migrations.
12. Improved Lead and Order UI/UX.

Do NOT break or remove any existing functionality.

---

# 2. IMPORTANT IMPLEMENTATION RULE

Before changing code:

1. Inspect the existing CRM structure.
2. Inspect the existing leads database schema.
3. Inspect existing lead APIs/actions.
4. Inspect company and website relationships.
5. Inspect employee/admin authentication and authorization.
6. Inspect the existing sidebar/navigation implementation.
7. Inspect existing table, modal, form, dropdown and button components.
8. Inspect the existing database migration system.
9. Inspect existing notes/timeline functionality.
10. Inspect existing file naming and coding conventions.

Do not create a parallel architecture if an existing reusable architecture already exists.

Reuse existing components, APIs, utilities and database patterns wherever appropriate.

Do not hard-code IDs.

Do not trust company_id, website_id, expert_id, employee_id or other relational IDs directly from the browser without server-side authorization and validation.

All important business rules must be enforced server-side.

---

# 3. EXISTING LEAD SOURCES

After this implementation, the CRM must support TWO lead creation sources.

## Source A - Website Integration

Existing behavior must continue working:

Website Form → Integration API → Validate integration → Identify company and website → Validate/normalize lead → Save lead → Initial status = `new`

Do not break this flow.

## Source B - Manual Admin Creation

Admin must be able to create a lead manually from the Leads page.

The Leads page must contain a prominent `Create Lead` button.

Clicking it opens a modal/popup form.

### Required fields

- Lead Name
- Email
- Phone Number
- Company
- Website

Company and Website must be dropdowns.

The Website dropdown must only show websites that belong to the selected Company.

When the Company changes:

- Refresh/filter the Website dropdown.
- Do not allow a website belonging to another company.
- Clear an invalid previously selected website.

### Recommended additional fields

If these already exist in the lead schema, preserve/support them:

- Message
- Form Name
- Source Page URL
- Custom Fields

If the current schema supports source information, manually created leads should have a clear source value such as `manual`.

Do not fake website source information for a manually created lead.

### Manual lead creation behavior

On submit:

1. Validate required fields.
2. Normalize email using the same logic as website leads.
3. Validate email format.
4. Validate company.
5. Validate website.
6. Confirm the website belongs to the selected company.
7. Create the lead.
8. Initial status must be `new`.
9. Record the creator if the existing system has created_by/audit support.
10. Show success feedback.
11. Refresh/update the Leads table without requiring an unnecessary full-page reload where possible.

If the same company already has a lead with the same normalized email:

- Do NOT block creation unless the existing application already has a hard duplicate rule.
- Preserve the current duplicate philosophy.
- The new lead should be saved.
- Mark/return it as a duplicate where the existing system supports that behavior.
- Keep the original lead reference where applicable.

---

# 4. LEADS TABLE - NEW ACTIONS

The existing Leads table must be improved.

At the end/right side of every lead row, add an Actions area containing:

1. View
2. Edit
3. Create Order
4. Delete

Use appropriate icons + labels/tooltips according to the existing UI style.

Do not make the table unnecessarily cramped.

If the project already has a responsive table/action pattern, reuse it.

---

# 5. EDIT LEAD

Clicking `Edit` must open an edit form.

The admin must be able to update the lead's editable information.

At minimum:

- Name
- Email
- Phone
- Company
- Website
- Message
- Source Page URL
- Form Name
- Other existing editable lead fields

Company/Website dependency must behave exactly like the Create Lead form.

The server must validate:

- Email format.
- Required fields.
- Company existence.
- Website existence.
- Website belongs to selected company.
- User authorization.

Do not allow changing a lead to a website belonging to another company.

After successful update:

- Persist the changes.
- Show success feedback.
- Refresh the row/detail data.
- Preserve existing lead history/timeline.

Do not create a new lead record when editing.

---

# 6. DELETE LEAD - SOFT DELETE / TRASH

The normal `Delete` action must NOT permanently delete the lead.

It must move the lead into Trash.

Recommended implementation: use a soft-delete field such as `deleted_at`, or follow the existing project's soft-delete architecture if one already exists.

A deleted lead must:

- Stop appearing in the normal Leads list.
- Remain in the database.
- Retain its original data.
- Retain its relationships/history/orders.
- Appear in the Leads Trash page.

Do not physically delete the database row during the normal Delete action.

Before deletion, show a confirmation dialog:

`Are you sure you want to move this lead to Trash?`

Clearly explain that the lead can be permanently deleted from Trash.

---

# 7. LEADS TRASH

Add a `Trash` button on the Leads page.

Clicking it opens a dedicated Trash page.

The Trash page must show deleted leads.

At minimum display:

- Lead Name
- Email
- Phone
- Company
- Website
- Deleted At
- Deleted By, if audit information is available
- Actions

Actions:

### Restore

Restore the lead from Trash.

Restoring must:

- Clear `deleted_at`.
- Return the lead to the normal Leads list.
- Preserve all lead information.
- Preserve order history.
- Preserve notes/history.

### Permanent Delete

Admin can permanently delete the lead from Trash.

This action must have a strong confirmation dialog.

Example:

`This will permanently delete the lead and cannot be undone. Continue?`

Permanent deletion must be server-side and authorized.

IMPORTANT: Before permanent deletion, account for dependent records. Do not create broken foreign-key records. For related orders/history/notes, follow an intentional referential strategy. Preserve them if the system requires historical records, reassign/anonymize where appropriate, and cascade only where explicitly safe and intended. Do NOT blindly cascade-delete important business history.

---

# 8. LEAD PROFILE MUST BECOME A DEDICATED PAGE

The current lead profile is too basic and opens as a popup.

Replace the main lead-detail experience with a dedicated route/page.

Example concept: `/leads/[id]`

Use the project's existing routing conventions.

Clicking a lead should navigate to its dedicated profile page.

Do not use a large modal as the primary profile experience.

The Lead Profile must be a complete workspace for that lead.

---

# 9. LEAD PROFILE - HEADER

The Lead Profile should have a clean professional header.

Display:

- Lead Name
- Lead Status
- Company
- Website
- Lead Source
- Created Date
- Last Updated
- Email
- Phone

Actions should include where applicable:

- Edit
- Create Order
- Change Status
- Convert to Contact
- Delete / Move to Trash

Use the existing CRM design language.

Improve spacing, hierarchy, cards, typography, empty states and responsive behavior.

---

# 10. LEAD PROFILE - CONTACT INFORMATION

Create a clear information section/card containing:

- Name
- Email
- Phone
- Company
- Website
- Source
- Form Name
- Source Page URL
- Created At
- Updated At

Do not display fields that do not exist.

For nullable values, use a professional empty state such as `Not provided` instead of broken UI or `undefined`.

---

# 11. LEAD PROFILE - MESSAGE AND CUSTOM DATA

Display the original lead message clearly.

If the lead contains custom fields/custom data, render them dynamically. Do not hard-code individual custom field names.

Example:

| Field | Value |
|---|---|
| Subject | ... |
| Word Count | ... |
| Budget | ... |

The existing website integration custom-field functionality must continue working.

---

# 12. LEAD PROFILE - NOTES / TIMELINE

The Lead Profile must display the lead's existing notes/history.

If the CRM already has a lead notes/timeline system:

- Reuse it.
- Do not create a duplicate notes architecture.

Show events in chronological order.

Relevant events may include:

- Lead created
- Lead updated
- Status changed
- Note added
- Lead converted
- Order created
- Order updated
- Order completed
- Lead restored
- Lead moved to trash

If audit/event infrastructure already exists, extend it rather than creating another unrelated event system.

---

# 13. EXPERTS MODULE

Add a new sidebar item: `Experts`

This must be a dedicated CRM module.

The existing employee management area should remain intact.

Experts are separate entities because an expert is assigned to an order/service rather than necessarily being a CRM employee.

Experts page must support:

- List experts
- Add expert
- Edit expert
- Delete/deactivate expert
- Search experts
- Filter experts where appropriate

---

# 14. EXPERT CREATE FORM

Click `Add Expert` to open a form.

Required field:

- Expert Name

Other fields:

- Email Address
- Password
- Service Area

The UI should clearly indicate required vs optional fields.

### Field rules

Expert Name:
- Required
- Trim whitespace

Email:
- Validate email format.
- Normalize/lowercase.
- Enforce uniqueness if the authentication/account architecture requires it.

Password:
- Never store plaintext passwords.
- Hash passwords using the project's existing secure password hashing mechanism.
- Never return password hashes to the frontend.

Service Area:
- Store the expert's area/category of expertise.

If the existing project already has a service/category model, reuse it instead of creating duplicate terminology.

---

# 15. EXPERT SERVICE AREA

The service area is important because orders are assigned to experts.

The data model must support an expert having a defined service area.

Example values:

- Writing
- Design
- Development
- SEO
- Marketing
- Other

Do not hard-code these values if the application already has a services table/configuration.

Prefer a relational/service reference if the existing architecture supports it.

---

# 16. EXPERT ACTIONS

Experts table should support:

- Edit
- Deactivate/Delete according to existing employee-management conventions

Do not permanently delete an expert if doing so would break historical order records.

If an expert has existing orders, prefer deactivation/soft deletion.

Historical orders must still display the expert who handled them.

---

# 17. CREATE ORDER FROM LEADS TABLE

Every lead row must have `Create Order`.

Clicking this opens the Create Order form.

The lead must automatically be associated with the order.

The admin should NOT have to manually select the lead again.

---

# 18. CREATE ORDER FORM - BASIC FIELDS

The form must contain:

### Service Name

Required. Identifies the service being ordered.

### Service Charges

Required. Use a numeric/decimal input. Follow existing currency/money conventions and avoid floating-point precision problems.

### Service Deadline

Required. Use an appropriate date/time input. Store it in a proper date/time field, not free text.

### Expert

Required dropdown containing available experts.

The dropdown should show enough information to identify the expert, for example:

`Expert Name - Service Area`

Only active experts should be selectable.

If service area matching is supported, prefer experts relevant to the selected service.

Do not automatically assign an expert unless an existing business rule explicitly requires it.

---

# 19. WRITING-SPECIFIC OPTIONAL SECTION

Under the main order fields, add a collapsible/expandable section.

The UI should contain an arrow.

Label: `Is it writing?`

When expanded, show:

- Word Count
- Subject Area

These fields are optional. They must NOT be required for every order.

The UI should make it clear that these fields apply to writing-related orders.

Recommended behavior:

- If the order is not writing, these values can remain NULL.
- If the user indicates that it is writing, the fields become available.
- Do not invent default values.

The database should allow NULL for these optional fields.

---

# 20. ORDER CREATION

When submitting Create Order:

1. Validate the lead.
2. Confirm the lead exists.
3. Confirm the lead is accessible to the current admin.
4. Validate service name.
5. Validate charges.
6. Validate deadline.
7. Confirm expert exists and is active.
8. Validate optional writing fields.
9. Generate an Order ID.
10. Create the order.
11. Associate it with the lead.
12. Associate it with the selected expert.
13. Record which authenticated employee/admin created the order.
14. Set initial order status.
15. Record creation timestamp.
16. Create an order timeline/audit event if supported.
17. Return the created order.
18. Show success feedback.
19. Refresh the Lead Profile/order list.

---

# 21. ORDER ID

Every order must receive an automatically generated Order ID.

Requirement: 4 numeric digits, for example `4821`.

Do NOT rely on random generation alone without collision handling.

If a generated 4-digit ID already exists:

- Generate another ID.
- Retry until unique.
- Enforce uniqueness at database level.

The database should have a unique constraint/index for the order ID.

If the application eventually exceeds the available 4-digit unique range, the constraint will need a future product decision. For the current requirement, implement the requested 4-digit format with uniqueness and collision handling.

Do not use the database primary key itself as the visible Order ID unless it satisfies the requirement.

---

# 22. ORDER STATUS

Orders need their own status lifecycle.

At minimum support:

- Pending
- In Progress
- Completed
- Cancelled

Use the project's existing enum/status convention if one exists.

Initial status: `Pending`

The user specifically requires the ability to mark an order as completed.

---

# 23. COMPLETE ORDER ACTION

In the Orders table and Lead Profile order section, provide an action to complete an order.

Example: `Mark as Completed`

When clicked:

1. Show confirmation if appropriate.
2. Update order status to `completed`.
3. Record completion timestamp.
4. Record who completed it if supported.
5. Add a timeline/event entry.
6. Update the UI immediately.

Do not delete or replace the original order.

The order remains part of permanent business history.

---

# 24. ORDER NOTES

Orders must support notes.

Reuse the existing CRM notes architecture if available.

Notes should show:

- Note text
- Author
- Created date/time

Order notes remain associated with the order and should be visible in the relevant Lead Profile order/history context.

---

# 25. ORDERS MODULE

Add a new sidebar item: `Orders`

The Orders page is the central order management area.

It must contain a table of orders.

At minimum show:

- Order ID
- Lead
- Company
- Service Name
- Service Charges
- Expert
- Deadline
- Status
- Created By
- Created At
- Completed At
- Actions

Actions can include:

- View
- Edit
- Mark Completed
- Add Note

Use existing UI conventions.

---

# 26. CREATE ORDER FROM ORDERS PAGE

The Orders page must also have `Create Order`.

Unlike the Lead table action, this workflow starts without a selected lead.

Therefore the form must first require:

### Lead

Dropdown/searchable lead selector.

After selecting the lead, show:

- Service Name
- Service Charges
- Service Deadline
- Expert
- Is it writing?
  - Word Count
  - Subject Area

The lead selector should support search by:

- Name
- Email
- Phone
- Lead ID where available

Only accessible, non-deleted leads should normally be selectable.

Do not allow creating a new order against a trashed lead unless explicitly required.

---

# 27. ORDER DETAIL PAGE

Orders should have a dedicated detail page if consistent with the CRM architecture.

Example: `/orders/[id]`

Display:

## Order Information

- Order ID
- Service Name
- Service Charges
- Deadline
- Status
- Created At
- Completed At
- Writing flag
- Word Count
- Subject Area

## Lead Information

- Lead Name
- Email
- Phone
- Company
- Website

Provide a link to the Lead Profile.

## Expert Information

- Expert Name
- Email
- Service Area

## Creation Information

- Created By
- Created At

## Notes

Display all order notes.

## Timeline

Display order events chronologically.

---

# 28. LEAD PROFILE - ORDERS SECTION

The Lead Profile must have a dedicated Orders section.

If the lead has no orders, display:

`No orders have been created for this lead yet.`

Include `Create Order`.

If orders exist, show:

- Order ID
- Service
- Charges
- Expert
- Deadline
- Status
- Created At
- Completed At
- Created By
- Actions

Clicking an order should open its detail page or existing order-detail experience.

---

# 29. LEAD PROFILE - COMPLETE A TO Z HISTORY

The Lead Profile must become the central place to understand everything that happened to the lead.

The page should contain:

### Lead Details
All lead information.

### Lead Status
Current status and status history where available.

### Notes
All lead notes.

### Timeline
Lead events.

### Orders
Every order associated with the lead.

### Order Details
For every order, show:

- What service was ordered.
- Service charges.
- Deadline.
- Expert.
- Order ID.
- Order status.
- Created date/time.
- Completion date/time.
- Created by which employee/admin.
- Notes.
- Writing details if applicable.
- Timeline/history.

### Contact Conversion
If converted:

- Converted Contact
- Conversion date/time
- Conversion event

The goal is that an admin can open one Lead Profile and understand the complete lifecycle of that lead without jumping through multiple unrelated screens.

---

# 30. ORDER HISTORY MUST NOT DISAPPEAR

Lead deletion must NOT casually destroy order history.

If a lead is moved to Trash:

- Orders remain historically accessible according to the application's retention policy.
- The relationship between order and lead remains valid while the lead exists in Trash.

If a lead is permanently deleted, the implementation must have an explicit referential strategy.

Recommended behavior: do not permanently delete a lead that has historical orders unless the system has a deliberate archive/anonymization mechanism.

If the product requirement explicitly requires permanent deletion despite historical orders, preserve order history using a safe historical snapshot/reference strategy rather than leaving broken foreign keys.

Do not make this decision silently. Implement the safest strategy consistent with the existing CRM data model and document it in the final summary.

---

# 31. DATABASE / MIGRATIONS

This task MUST include database migration files.

Do not directly modify the production database.

Create migration files that I can run/migrate myself.

At minimum evaluate whether the schema requires:

## Leads

Potential additions:

- `source`
- `created_by`
- `updated_by`
- `deleted_at`
- `deleted_by`

Only add fields that do not already exist.

## Experts

Create an experts table/model if one does not already exist.

Potential fields:

- id
- name
- email
- password_hash
- service_area/service_area_id
- status
- created_at
- updated_at
- deleted_at if soft delete is used

Use existing ID conventions.

## Orders

Create an orders table/model if one does not already exist.

Potential fields:

- internal primary key
- order_id / public_order_id
- lead_id
- expert_id
- service_name
- service_charges
- service_deadline
- is_writing
- word_count
- subject_area
- status
- created_by
- completed_by
- created_at
- updated_at
- completed_at

Use nullable fields where appropriate.

## Order Notes

If the existing notes system cannot support orders, create an appropriate order notes table with fields such as:

- id
- order_id
- author_id
- note
- created_at
- updated_at

## Order Events / Timeline

If existing timeline architecture cannot support orders, create an order events/history table with fields such as:

- id
- order_id
- event_type
- actor_id
- metadata/json
- created_at

Prefer extending existing event infrastructure over creating a duplicate system.

---

# 32. DATABASE CONSTRAINTS

Use database-level constraints where appropriate:

- Unique order public ID.
- Appropriate foreign keys.
- Appropriate indexes.
- Email indexes where useful.
- Lead deleted_at index if useful.
- Order status indexes where useful.
- Lead/company/website relationship indexes where useful.

Do not rely only on frontend validation.

---

# 33. MIGRATION REQUIREMENT

The implementation must deliver migration files as part of the code changes.

Do NOT execute production migrations.

The coding agent must:

1. Create migration files.
2. Explain migration order.
3. Explain what each migration changes.
4. Ensure migrations are reversible if the existing migration system supports down/revert migrations.
5. Verify migrations are syntactically valid.
6. Ensure code matches the final schema.

I will run the migration myself.

---

# 34. API REQUIREMENTS

Implement proper backend endpoints/actions for:

### Leads

- Create lead
- Get lead
- Update lead
- Soft delete lead
- List trash
- Restore lead
- Permanently delete lead

### Experts

- List experts
- Create expert
- Get expert
- Update expert
- Deactivate/delete expert

### Orders

- Create order
- List orders
- Get order
- Update order
- Mark order completed
- Add order note
- Get order timeline/history

Use existing API architecture.

Do not create insecure client-only mutations.

---

# 35. AUTHORIZATION

Every mutation must verify authenticated user permissions server-side.

At minimum protect:

- Lead creation
- Lead editing
- Lead deletion
- Lead restore
- Permanent lead deletion
- Expert management
- Order creation
- Order editing
- Order completion
- Order notes
- Order deletion if implemented

Do not trust role information sent from the client.

Follow the project's existing admin/employee permission system.

---

# 36. VALIDATION

Frontend validation improves UX. Backend validation enforces correctness. Both should exist.

Validate:

### Lead

- Name required.
- Valid email.
- Company exists.
- Website exists.
- Website belongs to company.
- Phone according to existing CRM rules.
- Status must be valid.

### Expert

- Name required.
- Email format if supplied.
- Password requirements according to existing auth policy.
- Service area valid/acceptable.

### Order

- Lead exists and is accessible.
- Lead is not deleted unless explicitly permitted.
- Service name required.
- Charges valid and non-negative.
- Deadline valid.
- Expert exists and is active.
- Word count valid if supplied.
- Subject area valid/acceptable if supplied.
- Status must be allowed.

---

# 37. UI/UX REQUIREMENTS

The existing Lead UI needs improvement.

The new design should feel like a professional Business CRM.

### Leads page

Include:

- Page title.
- Short useful description.
- Create Lead button.
- Trash button.
- Existing filters.
- Search.
- Clean table.
- Responsive action area.
- Proper loading states.
- Empty states.
- Error states.
- Confirmation dialogs.

### Lead Profile

Use:

- Header/card.
- Status badge.
- Contact information card.
- Lead source information.
- Message/custom data.
- Timeline.
- Notes.
- Orders section.
- Clear actions.

Avoid:

- Huge unnecessary whitespace.
- Excessive nested cards.
- Tiny text.
- Confusing buttons.
- Inconsistent spacing.
- Poor mobile behavior.

### Forms

Use:

- Labels.
- Validation messages.
- Required indicators.
- Loading state while saving.
- Disabled submit during request.
- Success/error feedback.
- Confirmation where destructive.

---

# 38. RESPONSIVE DESIGN

The UI must work on desktop, laptop, tablet and mobile where the existing CRM supports it.

Tables should not destroy the page on smaller screens.

Use responsive patterns already present in the application.

---

# 39. SEARCH AND FILTERS

Orders should support useful filtering.

At minimum consider:

- Order ID
- Lead
- Expert
- Status
- Company
- Deadline/date range

Do not add unnecessary filters if they conflict with existing UI architecture.

Existing lead filters must continue working.

---

# 40. AUDITABILITY

Where the existing architecture supports it, record:

- Who created a lead.
- Who edited a lead.
- Who moved a lead to Trash.
- Who restored a lead.
- Who permanently deleted a lead.
- Who created an order.
- Who updated an order.
- Who completed an order.
- Who added notes.

Do not expose sensitive authentication information in logs or timeline entries.

Never log plaintext passwords.

---

# 41. DATA INTEGRITY

Preserve existing relationships:

Company → Websites → Leads → Contacts

Add:

Lead → Orders → Expert

Intended relationship:

Company
  ↓
Website
  ↓
Lead
  ↓
Order
  ↓
Expert

A lead can have multiple orders.

An expert can have multiple orders.

An order belongs to one lead.

An order is assigned to one expert unless existing architecture explicitly supports multiple experts.

---

# 42. EXISTING WEBSITE LEAD INTEGRATION MUST REMAIN COMPATIBLE

This is critical.

Do not change the website integration contract unnecessarily.

Existing website integrations must continue sending leads successfully.

Preserve:

- Integration ID validation.
- Secret validation.
- Company identification.
- Website identification.
- Email normalization.
- Lead validation.
- Duplicate detection.
- Custom fields.
- Last received timestamp.

After the new changes, both Website → Lead and Admin → Lead must work.

---

# 43. STATUS SEPARATION

Do not confuse Lead Status and Order Status.

Lead status:

- New
- Contacted
- Qualified
- Converted
- Lost

Order status:

- Pending
- In Progress
- Completed
- Cancelled

An order becoming completed does NOT automatically mean the lead status becomes converted unless an explicit business rule already exists.

Likewise, converting a lead to a contact does NOT automatically mean every order is completed.

Keep these lifecycles separate.

---

# 44. ERROR HANDLING

Every API should return useful structured errors according to existing API conventions.

Frontend should show human-readable messages.

Examples:

- Invalid email.
- Website does not belong to selected company.
- Lead not found.
- Lead has been deleted.
- Expert not found.
- Expert is inactive.
- Order ID collision.
- Invalid deadline.
- Unauthorized action.

Do not expose database stack traces to users.

---

# 45. LOADING / EMPTY / ERROR STATES

Implement proper states for:

- Leads loading.
- Lead profile loading.
- Experts loading.
- Orders loading.
- Form submission.
- Trash loading.
- Empty leads.
- Empty trash.
- Empty orders.
- Empty lead orders.
- API failure.

Avoid blank screens.

---

# 46. SECURITY REQUIREMENTS

Do not:

- Store plaintext expert passwords.
- Trust frontend authorization.
- Trust company_id/website_id relationships from the browser.
- Expose sensitive database fields.
- Allow unauthorized permanent deletion.
- Use SQL strings unsafely.
- Introduce SQL injection risks.
- Expose internal secrets.

Follow the existing security architecture.

---

# 47. BACKWARD COMPATIBILITY

Before finalizing verify that:

- Existing website lead integration still works.
- Existing Leads filters still work.
- Existing lead status updates still work.
- Existing notes still work.
- Existing lead conversion still works.
- Existing contacts are unaffected.
- Existing campaign functionality is unaffected.
- Existing company/website management is unaffected.
- Existing employee management is unaffected.

---

# 48. TESTING REQUIREMENTS

Before declaring complete, test at minimum:

## Manual Lead

- Create valid lead.
- Create duplicate email lead.
- Invalid email.
- Missing name.
- Invalid company.
- Website from another company.
- Missing website.

## Website Lead

- Existing integration submits successfully.
- Existing custom fields still arrive.
- Duplicate website lead still behaves as before.

## Lead Edit

- Edit normal fields.
- Change company + website.
- Try mismatched company/website.
- Invalid email.

## Trash

- Delete lead.
- Confirm lead disappears from normal list.
- Confirm lead appears in Trash.
- Restore lead.
- Confirm it returns.
- Permanently delete.
- Confirm it no longer exists.

## Expert

- Create expert.
- Invalid email.
- Edit expert.
- Deactivate expert.
- Confirm inactive expert cannot be selected for new orders.
- Confirm historical orders still show deactivated expert.

## Orders

- Create order from Lead table.
- Create order from Lead Profile.
- Create order from Orders page.
- Generate 4-digit unique Order ID.
- Test duplicate Order ID collision handling.
- Create writing order.
- Create non-writing order.
- Test optional Word Count.
- Test Subject Area.
- Complete order.
- Verify completion timestamp.
- Add notes.
- Verify order appears on Lead Profile.
- Verify order appears on Orders page.

## Permissions

Test authorized and unauthorized users.

---

# 49. PERFORMANCE

Avoid unnecessary queries.

Examples:

- Do not fetch all experts for every unrelated lead row.
- Do not fetch every order's entire timeline when rendering the Orders list.
- Use pagination for large tables if the existing CRM supports pagination.
- Use server-side filtering/search where appropriate.
- Add database indexes for frequently queried relationships.

Avoid N+1 query patterns.

---

# 50. FINAL IMPLEMENTATION REQUIREMENTS

The coding agent must complete the implementation, not merely describe it.

Final work should include:

1. Updated Leads UI.
2. Manual Create Lead flow.
3. Lead Edit flow.
4. Lead Trash flow.
5. Restore flow.
6. Permanent deletion flow.
7. Dedicated Lead Profile page.
8. Improved Lead Profile UI/UX.
9. Experts sidebar/module.
10. Expert CRUD/deactivation.
11. Create Order from Lead.
12. Orders sidebar/module.
13. Create Order from Orders page.
14. Order list.
15. Order detail.
16. Order status management.
17. Mark Completed functionality.
18. Order notes.
19. Lead order history.
20. Timeline/history integration.
21. Required APIs/server actions.
22. Required database migrations.
23. Validation.
24. Authorization.
25. Tests/build verification.

---

# 51. DO NOT DO THESE THINGS

Do NOT:

- Remove the existing website integration.
- Automatically convert every new lead into a contact.
- Change existing lead status semantics without a requirement.
- Permanently delete leads through the normal Delete button.
- Delete historical orders when moving a lead to Trash.
- Store plaintext expert passwords.
- Trust frontend company/website relationships.
- Create duplicate architecture when an existing module can be extended.
- Hard-code expert IDs, company IDs, website IDs or lead IDs.
- Make Word Count and Subject Area mandatory for every order.
- Automatically mark an order completed during creation.
- Automatically change lead status when an order is completed unless explicitly required.
- Break existing campaign/contact functionality.
- Execute production database migrations.

---

# 52. DELIVERABLE FORMAT

When implementation is complete, provide a concise technical summary containing:

## A. Files Created

List every new file.

## B. Files Modified

List every modified file.

## C. Database Migrations

For every migration:

- Migration filename.
- Tables/columns/indexes changed.
- Why the migration is required.

## D. APIs Added/Changed

List endpoints/server actions and their purpose.

## E. UI Added/Changed

List:

- Leads page.
- Lead Profile.
- Trash.
- Experts.
- Orders.
- Order Detail.
- Forms/modals.

## F. Testing

Report:

- Build result.
- Lint result if available.
- Tests executed.
- Important manual test results.
- Any known limitations.

## G. Migration Instructions

Provide the exact migration command(s) required for this project.

Do not execute the production migration.

---

# 53. DEFINITION OF DONE

This task is complete only when:

A website lead can still enter the CRM exactly as before.

AND

An admin can manually create a lead.

AND

An admin can edit a lead.

AND

An admin can move a lead to Trash.

AND

An admin can restore a lead.

AND

An admin can permanently delete a lead from Trash.

AND

A lead opens in a dedicated profile page.

AND

The profile contains the lead's complete relevant information.

AND

Experts can be managed from their own sidebar module.

AND

An order can be created directly from a lead.

AND

An order can be created from the Orders module after selecting a lead.

AND

Orders have unique 4-digit public Order IDs.

AND

Orders can be assigned to experts.

AND

Writing orders can store Word Count and Subject Area.

AND

Orders have their own lifecycle.

AND

Orders can be marked Completed.

AND

Orders display completion information.

AND

Orders remain visible in the Lead Profile.

AND

Order notes/history are preserved.

AND

The Leads and Orders UI is significantly cleaner and more usable.

AND

All required database migrations are created but NOT executed against production.

AND

Existing CRM functionality continues to work.

AND

The implementation is complete, consistent with the existing codebase, secure, validated, and production-ready.
