We need to completely replace the CRM's existing email/webmail integration with the new Hostinger Mail API integration.

IMPORTANT:

* Do NOT mention, implement, or prepare anything for any other email provider.
* For this task, the ONLY email provider we are integrating is **Hostinger**.
* Remove the old email integration/settings completely.
* Do not leave obsolete IMAP, SMTP, cron, polling, or previous provider-specific email configuration in the CRM.
* Do not create a generic/multi-provider system yet. We will handle other providers separately in a future task.
* The current task is ONLY for Hostinger.

## 1. First inspect the existing email implementation

Before making changes, inspect the entire CRM codebase and identify every existing email-related component.

Search for:

* IMAP configuration
* SMTP configuration
* PHPMailer
* Nodemailer
* mail server credentials
* email host/port settings
* email username/password fields
* email connection settings
* cron-based email fetching
* email polling
* email workers
* email queues related to the old implementation
* existing email API routes
* email database tables
* email inbox components
* email conversation/thread components
* email notification code
* existing webhook endpoints
* old environment variables
* old email settings UI
* old email configuration pages
* old email services/classes/helpers
* old email-related migrations

Do not delete anything blindly.

Trace the dependencies first and determine what is actually being used.

## 2. Remove the old email/webmail settings

The old email configuration must not remain visible or active in the CRM.

Remove obsolete settings such as:

* IMAP Host
* IMAP Port
* IMAP Username
* IMAP Password
* SMTP Host
* SMTP Port
* SMTP Username
* SMTP Password
* Encryption/TLS settings related to the old system
* Cron/polling settings
* Old email provider settings
* Old email connection/test settings
* Old email worker configuration
* Old email fetch configuration

Remove the related frontend UI, backend logic, environment variables and database configuration where they are no longer required.

IMPORTANT:

Do not remove the CRM's actual email inbox, conversations, messages, leads, contacts, or other business data unless it is explicitly part of the obsolete integration.

We are replacing the email transport/integration mechanism, not deleting existing CRM email data.

## 3. Install Hostinger Mail API SDK

Use the Hostinger Mail API Node.js SDK.

Install:

```bash
npm install hostinger-mail-api-sdk
```

Do not use a random third-party email SDK.

Do not implement IMAP polling as the primary incoming-email mechanism.

Do not use cron jobs for incoming email detection.

Do not create a local worker.

Do not require a VPS.

## 4. Inspect the actual SDK before implementation

This is extremely important.

Do NOT assume SDK method names.

After installing the package, inspect:

```bash
npm view hostinger-mail-api-sdk
```

and the installed package itself.

Inspect:

* package exports
* TypeScript definitions
* available classes
* available methods
* authentication methods
* message APIs
* sending APIs
* mailbox APIs
* webhook APIs
* attachment APIs
* relevant request/response types

Use the actual installed SDK/API definitions.

If the SDK does not expose a particular capability, check Hostinger's official Mail API documentation before deciding how to implement it.

Never invent methods.

## 5. Hostinger API authentication

The Hostinger API token must be stored only on the server.

Use an environment variable such as:

```env
HOSTINGER_API_TOKEN=your_token
```

Do NOT expose this token to:

* React/Next.js frontend
* browser JavaScript
* client-side environment variables
* API responses
* logs
* Git
* GitHub

If the project already has an environment configuration convention, follow it.

Do not hardcode the token.

## 6. Hostinger mailbox configuration

The CRM should know which Hostinger mailbox is connected.

For example:

```env
HOSTINGER_MAILBOX=info@example.com
```

However, first inspect the existing CRM architecture.

If the CRM already has a secure settings/database system, use that rather than unnecessarily hardcoding the mailbox.

The mailbox should be configurable from the backend/admin settings where appropriate.

Do not expose the Hostinger API token.

## 7. Incoming email must use Hostinger Webhooks

The main requirement is near-instant incoming email processing.

Do NOT use:

```text
Cron jobs
1-minute polling
IMAP polling
Local workers
Persistent IMAP processes
```

Use Hostinger's webhook functionality.

The desired flow is:

```text
Client sends email
        ↓
Hostinger Mailbox
        ↓
Hostinger message.received webhook
        ↓
CRM webhook endpoint
        ↓
Validate request
        ↓
Process email
        ↓
Save email
        ↓
Update conversation
        ↓
Realtime CRM notification
        ↓
CRM inbox updates
```

Create a secure webhook endpoint such as:

```text
POST /api/email/hostinger/webhook
```

Use the project's existing backend routing conventions.

## 8. Hostinger webhook configuration

The implementation must support the Hostinger webhook for incoming messages.

The expected event is:

```text
message.received
```

Configure the webhook using Hostinger's current API/dashboard requirements.

Do not guess the webhook payload.

Inspect Hostinger's current documentation and SDK types to determine the actual payload structure.

The webhook endpoint must be publicly accessible over HTTPS.

## 9. Webhook authentication

The webhook endpoint must verify that the request actually originated from the configured Hostinger webhook.

Use the authentication/secret mechanism documented by Hostinger.

Store the webhook secret/token server-side, for example:

```env
HOSTINGER_WEBHOOK_SECRET=your_secret
```

Never expose it to the frontend.

Reject unauthorized webhook requests.

## 10. Incoming email processing

When Hostinger sends a `message.received` webhook:

1. Validate authentication.
2. Validate payload structure.
3. Extract available message information.
4. Determine sender.
5. Determine recipient/mailbox.
6. Extract subject.
7. Extract plain-text body.
8. Extract HTML body.
9. Extract message ID.
10. Extract threading information.
11. Extract attachment information.
12. Identify the corresponding CRM contact/lead.
13. Find the existing conversation/thread.
14. Create a conversation if required.
15. Save the incoming message.
16. Mark it as incoming.
17. Mark it unread.
18. Trigger realtime UI update.
19. Return a successful HTTP response.

Do not perform unnecessary long-running operations before acknowledging the webhook.

## 11. Duplicate prevention

Webhook systems can retry requests.

The same email must never create duplicate CRM messages.

Use the Hostinger message identifier or Message-ID provided by the API.

Implement a database-level uniqueness strategy where possible.

Logic:

```text
Webhook received
       ↓
Does this message already exist?
       ↓
YES → safely acknowledge and stop
NO  → process and save
```

This must be idempotent.

## 12. Email threading

Implement proper email threading.

When an incoming email is a reply to an existing conversation, it should appear inside the same CRM conversation.

Use available email headers/identifiers such as:

```text
Message-ID
In-Reply-To
References
```

and any Hostinger thread/message identifiers supported by the API.

Do not create a completely new CRM conversation for every reply.

## 13. Outgoing email

The CRM must send emails using Hostinger Mail API.

Flow:

```text
CRM
 ↓
POST /api/email/send
 ↓
CRM backend
 ↓
Hostinger Mail API SDK
 ↓
Hostinger
 ↓
Recipient
```

Implement:

* To
* CC
* BCC
* Subject
* HTML body
* Plain-text body where supported
* Attachments
* Replying to existing conversations

The Hostinger API token must remain server-side.

## 14. Fast email sending

The requirement is that when an admin clicks Send, the CRM should submit the email to Hostinger as quickly as possible, ideally within a couple of seconds under normal network/API conditions.

Do NOT promise that the recipient's inbox will receive the email in exactly two seconds.

The target is:

```text
CRM Send
   ↓
Hostinger API
   ↓
Hostinger accepts/queues message
```

Keep the request efficient.

Do not introduce unnecessary delays.

## 15. Outgoing email storage

After a successful send:

```text
direction = outgoing
```

Save the email in the CRM.

Associate it with:

* CRM user
* contact/lead
* conversation
* recipient
* message ID if available
* timestamp

The sent message must immediately appear in the relevant CRM conversation.

## 16. Attachments

Use Hostinger's supported API functionality for attachments.

For incoming emails:

* Detect attachments.
* Store attachment metadata.
* Preserve filename.
* Preserve MIME type.
* Preserve size.
* Store the actual file using the CRM's existing storage strategy.

For outgoing emails:

* Allow CRM users to attach files.
* Send attachments through Hostinger Mail API if supported.

Do not store large binary files directly in database fields unless the existing architecture intentionally uses that approach.

## 17. Realtime CRM updates

The incoming webhook should update the CRM UI without page refresh.

Inspect the existing project to determine whether Supabase Realtime is already being used.

If Supabase Realtime is already available, use it.

Preferred flow:

```text
Hostinger Webhook
       ↓
CRM Backend
       ↓
Database INSERT
       ↓
Supabase Realtime
       ↓
CRM Frontend
```

When a new email arrives:

* Email list updates.
* Conversation updates.
* Unread count increases.
* Notification appears.
* User does not need to refresh the page.

Do not introduce Socket.IO or another WebSocket framework if Supabase Realtime already provides the required functionality.

## 18. Email UI

Inspect the existing CRM email UI and integrate the new Hostinger backend into it.

Do not unnecessarily redesign unrelated CRM screens.

The existing email inbox should support:

* Incoming messages
* Sent messages
* Conversations
* Read/unread status
* Attachments
* Reply
* New email notification
* Realtime updates

If the current email UI has old provider-specific settings, remove those settings.

## 19. Environment cleanup

Remove obsolete environment variables associated with the previous email implementation.

Do not leave unused credentials in `.env`.

Do not delete unrelated environment variables.

The final email-related environment configuration should contain only what is actually required by the Hostinger integration.

For example:

```env
HOSTINGER_API_TOKEN=
HOSTINGER_MAILBOX=
HOSTINGER_WEBHOOK_SECRET=
```

Use the actual names/conventions appropriate for the project.

## 20. Database cleanup

Inspect existing database tables before making migrations.

Do not delete existing email history.

If the old integration created provider-specific configuration tables that are no longer required, remove them safely.

Preserve:

* emails
* contacts
* leads
* conversations
* attachments
* users
* relationships

unless there is a clear reason they belong exclusively to the obsolete integration.

Create migrations for structural changes.

Do not manually modify production data without a migration.

## 21. Security

This integration handles business email.

Implement:

* Server-side API token storage.
* Secure webhook authentication.
* Input validation.
* HTML email sanitization.
* XSS protection.
* Attachment validation.
* CRM authorization.
* Duplicate protection.
* Proper error handling.
* No credentials in frontend.
* No credentials in Git.
* No sensitive credentials in logs.

Never render incoming email HTML as trusted application HTML without sanitization.

## 22. Error handling

Handle:

* Invalid Hostinger API token.
* Expired/revoked token.
* Invalid webhook authentication.
* Malformed webhook payload.
* Hostinger API errors.
* Network failures.
* Duplicate webhook.
* Invalid attachments.
* Database failures.
* Sending failures.

For outgoing emails, show the CRM user an understandable error such as:

```text
Failed to send email.
```

while logging technical details securely on the server.

For webhook errors, return appropriate HTTP status codes so Hostinger can retry when appropriate.

## 23. Logging

Add useful server-side logs for:

```text
Hostinger webhook received
Incoming email processed
Duplicate email ignored
Incoming email saved
Outgoing email sent
Outgoing email failed
Hostinger API error
Invalid webhook request
Attachment processing error
```

Never log:

```text
API token
Webhook secret
Mailbox password
Sensitive credentials
```

## 24. Testing

After implementation, perform real tests.

### Incoming email test

1. Send an email to the Hostinger mailbox.
2. Confirm Hostinger sends the webhook.
3. Confirm CRM receives the webhook.
4. Confirm email is stored.
5. Confirm correct contact/lead is identified.
6. Confirm conversation is created/updated.
7. Confirm CRM UI updates without refresh.
8. Confirm unread notification appears.
9. Send another reply.
10. Confirm it appears in the same conversation.
11. Trigger/replay the same webhook.
12. Confirm no duplicate message is created.

### Outgoing test

1. Open a CRM conversation.
2. Compose an email.
3. Send it.
4. Confirm Hostinger API accepts it.
5. Confirm the message appears in CRM as outgoing.
6. Confirm recipient receives it.
7. Test CC.
8. Test BCC.
9. Test attachment.
10. Test reply/threading.

### Security test

Test:

* Invalid webhook secret.
* Missing webhook authentication.
* Malformed payload.
* Duplicate webhook.
* XSS payload in email HTML.
* Unauthorized CRM access.
* Invalid attachment.
* Invalid API token.

## 25. Important constraints

Do NOT implement:

```text
❌ IMAP polling
❌ Cron-based inbox checking
❌ Local email worker
❌ VPS worker
❌ Old SMTP-based receiving system
❌ Old provider configuration
❌ Third-party email provider
```

The new incoming-email architecture must be:

```text
Hostinger
   ↓
Webhook
   ↓
CRM Backend
   ↓
Database
   ↓
Supabase Realtime
   ↓
CRM UI
```

Outgoing:

```text
CRM
   ↓
Hostinger Mail API SDK
   ↓
Hostinger
   ↓
Recipient
```

## 26. Do not stop at installation

Installing:

```bash
npm install hostinger-mail-api-sdk
```

is NOT the completed task.

The task is complete only when the SDK/API integration, webhook endpoint, database processing, email sending, threading, attachments, realtime UI updates, authentication, error handling, cleanup, and tests are implemented.

Before coding, inspect the existing CRM and the actual Hostinger SDK/API capabilities.

Do not guess.

Do not invent SDK methods.

Do not break unrelated CRM features.

The final result should be a clean, production-ready Hostinger email integration with near-real-time incoming emails and fast outgoing email sending.
