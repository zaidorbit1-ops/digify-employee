Below is the complete implementation plan. You can use this directly as the development specification for the CRM.

# Brevo + CRM Campaign Delivery Implementation Plan

## 1. Objective

Replace **Hostinger as the delivery provider for marketing campaigns** with **Brevo API**, while keeping the existing CRM campaign system and Hostinger Webmail completely intact.

### Final flow

```text
CRM
 │
 │ Campaign configuration
 ▼
Supabase Campaign Worker
 │
 │ Brevo API
 ▼
Brevo
 │
 │ Email delivery
 ▼
Recipient
```

For replies:

```text
Recipient
 │
 │ Reply
 ▼
Hostinger Mailbox
 │
 │ Existing incoming mail integration
 ▼
CRM Webmail
```

The CRM remains the source of truth for:

* Contacts
* Contact lists
* Dynamic segments
* Campaigns
* Templates
* Personalization
* Sender selection
* Scheduling
* Queue
* Sending status
* Retries
* Tracking
* Reports
* Campaign analytics

Brevo is **only the email delivery infrastructure**.

---

# 2. What Must NOT Change

The following existing functionality should remain unchanged.

### CRM Webmail

Keep:

* Hostinger mailbox connection
* Hostinger mailbox verification
* Hostinger incoming webhook
* Inbox
* Sent
* Replies
* Threads
* Email history
* Normal one-to-one sending
* Existing Hostinger Mail API integration

Normal CRM email:

```text
CRM Webmail
   ↓
Hostinger Mail API
   ↓
Recipient
```

Campaign email:

```text
CRM Campaign
   ↓
Supabase Worker
   ↓
Brevo API
   ↓
Recipient
```

Do **not** migrate Webmail to Brevo.

---

# 3. Existing Campaign Flow

The current campaign creation flow should remain almost identical.

## Step 1: Create Campaign

User selects:

* Company
* Campaign name
* Sender mailbox

Example:

```text
Company:
Class Takers Pro

Sender:
info@classtakerspro.com
```

The sender dropdown should continue showing only connected mailboxes belonging to the selected company.

---

# 4. Audience Selection

Keep the existing three options.

### Named Contact List

Example:

```text
Active Students
```

Worker gets active contacts from that list.

### Dynamic Segment

Example:

```text
Country = UK
Status = Active
```

Worker dynamically resolves matching contacts.

### All Active Contacts

Worker gets all active contacts belonging to the selected company.

---

# 5. Email Template

Keep the existing template system.

Supported variables:

```text
{{first_name}}
{{last_name}}
{{email}}
{{company_name}}
```

Example:

```text
Hi {{first_name}},

We wanted to share something that may help you with your studies.
```

Before sending, the worker replaces variables using the actual recipient record.

Example:

```text
Hi John,
```

---

# 6. Sender / Mailbox Architecture

This is the most important database change.

The campaign already stores:

```text
mailbox_id
```

Keep that.

Do **not** store a Brevo API key directly inside each campaign.

Instead:

```text
campaign
   ↓
mailbox_id
   ↓
mailbox
   ↓
provider
   ↓
provider account
```

For example:

```text
Campaign
  mailbox_id = 17

Mailbox #17
  email = info@classtakerspro.com
  provider = brevo

Brevo Account
  account_id = 4
```

This makes the system provider-independent.

---

# 7. Provider Abstraction

Create a provider abstraction instead of putting Brevo-specific code throughout the worker.

Recommended structure:

```text
lib/
  email/
    providers/
      hostinger.ts
      brevo.ts
    email-provider.ts
```

Conceptually:

```ts
interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>
}
```

Example:

```ts
type SendEmailParams = {
  fromEmail: string
  fromName?: string
  toEmail: string
  toName?: string
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
}
```

Result:

```ts
type SendEmailResult = {
  success: boolean
  providerMessageId?: string
  error?: string
}
```

---

# 8. Provider Selection

The worker should determine the provider from the selected mailbox.

Example:

```ts
if (mailbox.provider === "hostinger") {
  return hostingerProvider.sendEmail(...)
}

if (mailbox.provider === "brevo") {
  return brevoProvider.sendEmail(...)
}
```

Better:

```ts
const provider = getEmailProvider(mailbox.provider)

await provider.sendEmail(...)
```

This means later you can add:

```text
Hostinger
Brevo
SendGrid
Amazon SES
Mailgun
```

without rebuilding the campaign system.

---

# 9. Mailbox Database Changes

Add provider information to the mailbox configuration.

Example:

```text
mailboxes

id
company_id
email
display_name
provider
provider_account_id
provider_sender_id
is_connected
```

Possible provider values:

```text
hostinger
brevo
```

For a Brevo mailbox:

```text
provider = brevo
```

For existing Hostinger mailboxes:

```text
provider = hostinger
```

This allows both systems to coexist.

---

# 10. Brevo Provider Account Table

Create a separate table for provider credentials.

Example:

```text
email_provider_accounts

id
provider
name
api_key_encrypted
is_active
created_at
updated_at
```

Example:

```text
id: 1
provider: brevo
name: Main Brevo Account
api_key_encrypted: ********
is_active: true
```

Do not store API keys in the campaign table.

---

# 11. Mapping Mailbox to Brevo

Example:

```text
email_provider_accounts

id = 1
provider = brevo
```

Then:

```text
mailboxes

id = 17
email = info@classtakerspro.com
provider = brevo
provider_account_id = 1
```

Another mailbox:

```text
id = 18
email = info@topdissertationwriters.co.uk
provider = brevo
provider_account_id = 1
```

Both can use the same Brevo account if that matches your business setup.

---

# 12. Authenticate Sending Domains in Brevo

Every domain you want to send from through Brevo needs to be authenticated in Brevo.

For example:

```text
classtakerspro.com
```

and:

```text
topdissertationwriters.co.uk
```

Add the DNS records Brevo provides.

Typically this involves:

* DKIM
* SPF-related configuration
* Brevo verification records

The important point is:

```text
From:
info@classtakerspro.com
```

can remain a Hostinger mailbox.

Brevo does not need to host the mailbox.

Brevo only needs permission/authentication to send using that domain.

---

# 13. Hostinger MX Records Stay

Do **not** change the domain's MX records away from Hostinger if you want replies to continue arriving in Hostinger.

The architecture should be:

```text
DNS

MX
 ↓
Hostinger
 ↓
Incoming mail
```

while:

```text
Brevo
 ↓
Outgoing campaign email
```

Therefore:

```text
Sending = Brevo
Receiving = Hostinger
```

This is exactly what we want.

---

# 14. Sender Identity

The CRM should continue displaying:

```text
Display Name:
Class Takers Pro

Email:
info@classtakerspro.com
```

Brevo receives:

```json
{
  "sender": {
    "name": "Class Takers Pro",
    "email": "info@classtakerspro.com"
  }
}
```

The sender must exist/authenticate in Brevo.

---

# 15. Brevo API

Create a dedicated Brevo provider.

The provider will call Brevo's transactional email API:

```text
POST /v3/smtp/email
```

Conceptually:

```ts
const response = await fetch(
  "https://api.brevo.com/v3/smtp/email",
  {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail
      },
      to: [
        {
          email: toEmail,
          name: toName
        }
      ],
      subject,
      htmlContent: html,
      replyTo: {
        email: replyTo
      }
    })
  }
)
```

Do not expose the API key to the browser.

Only the Supabase Edge Function should have access to it.

---

# 16. Brevo API Key

Create a Brevo API key and store it as a Supabase secret.

For example:

```text
BREVO_API_KEY
```

If you have multiple legitimate businesses using separate Brevo accounts, use separate secrets/accounts rather than trying to artificially multiply one account's quota.

---

# 17. Supabase Secrets

Add:

```text
BREVO_API_KEY
```

to the Supabase Edge Function environment.

Existing secrets remain:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CRM_CAMPAIGN_CRON_SECRET
CRM_PUBLIC_URL
```

Hostinger secrets can remain because Webmail still uses them.

---

# 18. Recommended Multi-Account Structure

If multiple companies use different Brevo accounts, don't create:

```text
BREVO_API_KEY_1
BREVO_API_KEY_2
BREVO_API_KEY_3
```

unless you genuinely need that architecture.

Prefer a provider-account configuration:

```text
email_provider_accounts

id | provider | account_name | secret_key_name
------------------------------------------------
1  | brevo    | Main Brevo    | BREVO_API_KEY
2  | brevo    | Company B     | BREVO_API_KEY_B
```

The worker resolves:

```text
mailbox
 ↓
provider_account
 ↓
secret
```

---

# 19. Campaign Queue

Keep your existing queue.

Recommended structure:

```text
campaign_messages

id
campaign_id
contact_id
recipient_email
recipient_name
status
attempts
scheduled_at
sent_at
failed_at
provider
provider_message_id
error_message
last_attempt_at
created_at
updated_at
```

Statuses:

```text
queued
processing
sent
failed
```

Optional:

```text
cancelled
```

---

# 20. Queue Locking

Keep:

```sql
FOR UPDATE SKIP LOCKED
```

This is important if multiple worker invocations happen at the same time.

Example concept:

```sql
SELECT *
FROM campaign_messages
WHERE status = 'queued'
AND scheduled_at <= NOW()
ORDER BY scheduled_at
LIMIT 20
FOR UPDATE SKIP LOCKED;
```

This prevents two workers from sending the same email.

---

# 21. Campaign Worker

The worker continues doing the same job.

New flow:

```text
Worker starts
      ↓
Find scheduled/running campaigns
      ↓
Resolve campaign mailbox
      ↓
Resolve provider
      ↓
Resolve provider account
      ↓
Build queue
      ↓
Get due queue messages
      ↓
Personalize HTML
      ↓
Apply tracking
      ↓
Send through provider
      ↓
Store provider message ID
      ↓
Update status
      ↓
Create campaign event
```

---

# 22. Worker Should NOT Know Brevo Details

Avoid this:

```ts
if (campaign.mailbox_id === 17) {
   // Brevo code
}
```

And avoid:

```ts
if (company === "Class Takers Pro") {
   // Brevo
}
```

Instead:

```ts
const mailbox = await getMailbox(campaign.mailbox_id)

const provider = getEmailProvider(mailbox.provider)

const result = await provider.sendEmail(...)
```

This is much cleaner.

---

# 23. Personalization

Personalization happens **inside the worker**, immediately before sending.

Example template:

```html
<h1>Hi {{first_name}}</h1>
<p>
We have something important to share with you.
</p>
```

Recipient:

```text
first_name = Sarah
```

Worker generates:

```html
<h1>Hi Sarah</h1>
<p>
We have something important to share with you.
</p>
```

Then the personalized HTML is sent to Brevo.

Do not rely on Brevo's template engine for your CRM personalization because the CRM already owns this functionality.

---

# 24. Tracking

Keep your existing CRM tracking system.

The worker should continue:

1. Generate recipient tracking record
2. Rewrite links
3. Inject open tracking pixel
4. Send final HTML
5. Store campaign message ID

Example tracking URL:

```text
https://office.digifyitsolution.com/api/campaigns/click/abc123
```

Open pixel:

```text
https://office.digifyitsolution.com/api/campaigns/open/abc123
```

The important sequence is:

```text
Create tracking record
        ↓
Generate tracking URLs
        ↓
Generate final HTML
        ↓
Send through Brevo
```

Do not generate tracking URLs using an unreachable local URL such as:

```text
http://0.0.0.0:3000
```

The public CRM URL must be used.

---

# 25. Brevo Message ID

Brevo should return a message identifier after successful submission.

Store it:

```text
provider_message_id
```

Example:

```text
provider = brevo
provider_message_id = <Brevo returned ID>
```

This gives you a connection between:

```text
CRM Campaign Message
        ↓
Brevo Message
```

This will be useful later for delivery/bounce/event reconciliation.

---

# 26. Reply-To

Keep the sender's mailbox as the reply address.

For example:

```text
From:
Class Takers Pro <info@classtakerspro.com>

Reply-To:
info@classtakerspro.com
```

Then:

```text
Recipient clicks Reply
        ↓
info@classtakerspro.com
        ↓
Hostinger
        ↓
CRM Webmail
```

This is critical.

---

# 27. Incoming Replies

No changes are required to your existing incoming mail architecture.

Brevo is not responsible for receiving replies.

Hostinger remains responsible.

Therefore:

```text
Campaign sent via Brevo
       ↓
Recipient replies
       ↓
Hostinger receives reply
       ↓
Existing incoming webhook
       ↓
CRM Webmail
```

This keeps the existing Webmail experience intact.

---

# 28. Normal Webmail

Normal email should continue using Hostinger.

Example:

```text
CRM Webmail → Compose
       ↓
Hostinger Mail API
       ↓
Recipient
```

Do not route normal emails through Brevo unless you intentionally decide to do that later.

The provider selection should therefore happen at the feature level:

```text
Normal Webmail
    → Hostinger

Campaigns
    → Mailbox's configured provider
```

---

# 29. Send Test

The current Send Test behavior should be updated according to provider.

Current:

```text
Send Test
 ↓
Next.js API
 ↓
Hostinger
```

For a Brevo campaign:

```text
Send Test
 ↓
Next.js API
 ↓
Brevo
```

However, the preferred long-term architecture is to have the same provider abstraction available to the test-send API too.

```ts
const provider = getEmailProvider(mailbox.provider)

await provider.sendEmail(...)
```

This avoids duplicate provider logic.

---

# 30. Test Personalization

For Send Test, you can continue using sample data.

Example:

```text
First Name: Test
Last Name: User
Email: test@example.com
Company: Example Company
```

Then:

```text
Hi Test,
```

This is only a rendering test.

The actual campaign worker uses real contact data.

---

# 31. Error Handling

The Brevo provider should distinguish between:

### Successful request

```text
HTTP 2xx
```

Mark:

```text
sent
```

### Temporary failure

Examples:

```text
429
5xx
network timeout
temporary provider error
```

Retry.

### Permanent failure

Examples:

```text
invalid email
invalid sender
authentication failure
bad request
```

Do not endlessly retry.

Mark:

```text
failed
```

---

# 32. Retry Logic

Keep your existing retry system.

Example:

```text
Attempt 1
   ↓
failure
   ↓
retry after 5 minutes

Attempt 2
   ↓
failure
   ↓
retry after 15 minutes

Attempt 3
   ↓
failure
   ↓
failed permanently
```

You can keep your current exponential/backoff implementation.

Maximum attempts:

```text
3
```

---

# 33. Rate Limiting

Do not attempt to fire hundreds of API requests simultaneously.

Keep the worker controlled.

For example:

```text
20 messages per invocation
```

Then:

```text
Worker
 ↓
20 emails
 ↓
next invocation
 ↓
20 emails
 ↓
next invocation
```

The exact throughput should be controlled by your existing:

```text
batch_size
interval_seconds
```

configuration.

---

# 34. Important Quota Handling

The CRM should not assume:

```text
500 contacts = 500 successfully sendable emails
```

The provider can reject messages because of:

* Daily quota
* Rate limit
* Invalid sender
* Invalid recipient
* Account restrictions
* Provider errors

Therefore the worker must record the actual result for every recipient.

Example:

```text
193 recipients

Sent:       180
Failed:       8
Retrying:     5
```

The campaign report should reflect those real states.

---

# 35. Campaign Status

Recommended campaign states:

```text
draft
scheduled
running
paused
completed
failed
cancelled
```

Example:

```text
Campaign: October Promotion

193 recipients

Queued:      193
Sent:        180
Failed:        8
Retrying:     5
```

---

# 36. Scheduler

This is important.

Saving a campaign does **not** automatically execute the Edge Function.

You need a scheduler that regularly invokes:

```text
campaign-worker
```

For example:

```text
Every minute
     ↓
Supabase Edge Function
     ↓
Check campaigns
     ↓
Process due messages
```

Your existing:

```text
CRM_CAMPAIGN_CRON_SECRET
```

should continue protecting the worker endpoint.

Request:

```http
x-cron-secret: ********
```

The worker verifies the secret before processing.

---

# 36a. Global Campaign Rolling Limit

Apply the `20261008210000_crm_campaign_rolling_24h_limit.sql` migration and deploy the updated `crm-campaign-worker` Edge Function. Campaign emails across all campaigns share one atomic allocation of 80 successful messages in any rolling 24-hour window. Ordinary Webmail and CRM test sends do not consume campaign allocation. Failed campaign sends release their reservation and do not count as successful sends.

Successful campaign sends are timestamped in the database. The recurring worker must continue running at least once per minute to detect newly available capacity and resume only campaigns marked `rate_limit_pause`. Campaigns marked `manual_pause` never resume automatically; users must choose Resume Campaign.

---

# 37. Worker Invocation

The architecture should be:

```text
Scheduler
    ↓
POST /campaign-worker
    ↓
Verify x-cron-secret
    ↓
Process queue
```

Do not expose an unrestricted campaign worker endpoint.

---

# 38. Database Transaction Safety

When selecting queue records:

```sql
FOR UPDATE SKIP LOCKED
```

When processing them, make sure another worker cannot pick them up.

Recommended flow:

```text
queued
 ↓
processing
 ↓
provider send
 ↓
sent / failed
```

If a worker crashes while processing, have a mechanism to recover stale:

```text
processing
```

records.

For example:

```text
processing for > 15 minutes
```

can be returned to:

```text
queued
```

or handled through a retry/recovery process.

---

# 39. Suggested Code Structure

A clean structure could look like:

```text
supabase/
└── functions/
    └── campaign-worker/
        ├── index.ts
        ├── providers/
        │   ├── brevo.ts
        │   ├── hostinger.ts
        │   └── index.ts
        ├── personalization.ts
        ├── tracking.ts
        ├── queue.ts
        ├── retry.ts
        └── types.ts
```

For the Next.js application:

```text
src/
└── lib/
    └── email/
        ├── providers/
        │   ├── brevo.ts
        │   └── hostinger.ts
        ├── provider-factory.ts
        └── types.ts
```

The exact directory names can follow your current project structure. The architecture matters more than making folders pretty, humanity has suffered enough from unnecessary folder hierarchies.

---

# 40. Provider Factory

Create something similar to:

```ts
function getEmailProvider(provider: string) {
  switch (provider) {
    case "brevo":
      return new BrevoProvider()

    case "hostinger":
      return new HostingerProvider()

    default:
      throw new Error(`Unsupported email provider: ${provider}`)
  }
}
```

Later:

```ts
case "ses":
case "sendgrid":
case "mailgun":
```

can be added without changing campaign logic.

---

# 41. Brevo Provider Responsibility

`brevo.ts` should only know how to:

* Authenticate with Brevo
* Construct Brevo API payload
* Send email
* Parse response
* Return provider message ID
* Return structured errors

It should NOT know:

* Which contacts belong to a campaign
* How segmentation works
* How personalization works
* How campaign scheduling works
* How reports work

Those belong to the CRM.

---

# 42. Campaign Worker Responsibility

The worker should know:

```text
Campaign
Contact
Template
Mailbox
Provider
Queue
Tracking
Retry
Status
```

But provider-specific HTTP implementation stays inside:

```text
providers/brevo.ts
```

---

# 43. Database Migration

Create a migration for:

### Mailboxes

Add:

```sql
provider
provider_account_id
provider_sender_id
```

### Provider accounts

Create:

```sql
email_provider_accounts
```

### Campaign messages

Add if not already present:

```sql
provider
provider_message_id
```

Potentially:

```sql
provider_response
```

for debugging, but avoid storing unnecessary sensitive provider data.

---

# 44. Example Database Relationship

```text
companies
    │
    └── mailboxes
            │
            ├── provider = brevo
            │
            └── provider_account_id
                    │
                    ▼
             email_provider_accounts
                    │
                    └── Brevo API key

campaigns
    │
    └── mailbox_id
            │
            ▼
         mailbox
```

---

# 45. Campaign Send Flow

Complete flow:

```text
User creates campaign
        ↓
Selects company
        ↓
Selects connected sender
        ↓
Selects audience
        ↓
Selects template
        ↓
Schedules campaign
        ↓
Campaign saved
        ↓
Worker detects campaign
        ↓
Build recipient queue
        ↓
Resolve mailbox
        ↓
Resolve provider
        ↓
Resolve Brevo account
        ↓
Get Brevo API key
        ↓
Personalize email
        ↓
Create tracking record
        ↓
Rewrite tracking links
        ↓
Inject tracking pixel
        ↓
Send to Brevo
        ↓
Brevo accepts message
        ↓
Store Brevo message ID
        ↓
Mark queue item SENT
        ↓
Create campaign event
        ↓
Continue next recipient
```

---

# 46. Reply Flow

```text
Brevo
  ↓
Recipient receives email
  ↓
Recipient clicks Reply
  ↓
info@classtakerspro.com
  ↓
Hostinger
  ↓
Existing incoming mail webhook
  ↓
CRM Webmail
  ↓
Conversation/thread
```

No Brevo receiving integration is required for this flow.

---

# 47. Tracking Flow

### Open

```text
Recipient opens email
        ↓
Tracking pixel requested
        ↓
CRM API
        ↓
Campaign recipient identified
        ↓
Viewed event stored
```

### Click

```text
Recipient clicks link
        ↓
CRM tracking URL
        ↓
Click event stored
        ↓
Redirect to original URL
```

Your existing tracking system can therefore remain.

---

# 48. Campaign Report

Existing reporting should continue to display:

```text
Recipients
Sent
Delivered
Opened
Clicked
Failed
Pending
```

Provider can be displayed internally:

```text
Provider:
Brevo
```

Optionally:

```text
Provider Message ID:
xxxxx
```

Don't expose unnecessary Brevo implementation details to normal CRM users.

---

# 49. Security

Never put:

```text
BREVO_API_KEY
```

inside:

* React components
* Browser JavaScript
* Campaign records
* Contact records
* HTML
* Client-side API responses

Only server-side/Edge Function code should access it.

---

# 50. API Key Rotation

Design the provider account table so API keys can be changed without modifying campaigns.

Example:

```text
mailbox
   ↓
provider_account_id = 1
```

If the Brevo API key changes:

```text
email_provider_accounts
```

is updated.

Existing campaigns continue working.

---

# 51. Logging

The worker should log:

```text
campaign_id
campaign_message_id
mailbox_id
provider
recipient
attempt
success/failure
provider_message_id
error
timestamp
```

Do not log API keys.

Example:

```text
Campaign 42
Message 1832
Provider: brevo
Recipient: user@example.com
Attempt: 1
Status: sent
Provider ID: xxx
```

---

# 52. Test Environment

Before switching production campaigns, test with one authenticated Brevo sender.

Example:

```text
info@classtakerspro.com
```

Test:

1. Domain authentication
2. Sender verification
3. API key
4. API request
5. Send Test
6. Real recipient
7. Reply
8. Tracking
9. Campaign queue
10. Retry
11. Failed email
12. Report

---

# 53. First Production Test

Don't immediately throw the entire 193-contact campaign at the new provider like a human discovering the accelerator pedal.

Start with:

```text
1 recipient
```

Then:

```text
5 recipients
```

Then:

```text
10 recipients
```

Then a larger controlled campaign.

Verify every stage.

---

# 54. Test Checklist

### Provider

* [ ] Brevo account created
* [ ] API key created
* [ ] API key stored securely
* [ ] Sending domain authenticated
* [ ] Sender configured
* [ ] DNS records verified

### CRM

* [ ] Mailbox provider field added
* [ ] Provider account mapping added
* [ ] Campaign mailbox selection unchanged
* [ ] Provider factory implemented
* [ ] Brevo provider implemented
* [ ] Hostinger provider still works

### Worker

* [ ] Brevo API call works
* [ ] Personalization works
* [ ] Tracking works
* [ ] Reply-To works
* [ ] Message ID stored
* [ ] Success status stored
* [ ] Failure status stored
* [ ] Retry works
* [ ] Queue locking works

### Webmail

* [ ] Reply reaches Hostinger
* [ ] Reply reaches CRM
* [ ] Existing inbox still works
* [ ] Normal CRM email still uses Hostinger

---

# 55. Rollback Plan

Do not delete the Hostinger integration.

If Brevo has a problem:

```text
mailbox.provider
```

can temporarily be changed back to:

```text
hostinger
```

Then:

```text
Campaign
 ↓
Worker
 ↓
Hostinger Provider
```

The campaign system itself does not need to be rewritten.

This is one of the main reasons to build the provider abstraction.

---

# 56. Recommended Implementation Order

Implement in this exact order.

### Phase 1: Database

1. Create `email_provider_accounts`
2. Add `provider` to mailboxes
3. Add `provider_account_id`
4. Add `provider_message_id` to campaign messages if missing
5. Add any required indexes

---

### Phase 2: Provider Architecture

Create:

```text
EmailProvider
ProviderFactory
HostingerProvider
BrevoProvider
```

First make sure existing Hostinger functionality still works through the new abstraction.

---

### Phase 3: Brevo

1. Create Brevo account
2. Authenticate domain
3. Verify sender
4. Create API key
5. Add API key to Supabase secrets
6. Implement `BrevoProvider`
7. Test direct API delivery

---

### Phase 4: CRM

Update mailbox configuration:

```text
Provider:
Brevo

Provider Account:
Main Brevo Account
```

Keep the existing connected mailbox UI.

---

### Phase 5: Worker

Modify worker:

```text
Campaign
 ↓
Mailbox
 ↓
Provider
 ↓
Provider factory
 ↓
Brevo
```

Don't modify audience/segmentation logic unless necessary.

---

### Phase 6: Personalization

Keep existing personalization.

```text
{{first_name}}
{{last_name}}
{{email}}
{{company_name}}
```

Render before provider send.

---

### Phase 7: Tracking

Keep:

```text
open tracking
click tracking
campaign events
```

Make sure tracking URLs use the production CRM URL.

---

### Phase 8: Reply-To

Set:

```text
replyTo = mailbox.email
```

This ensures replies continue reaching Hostinger.

---

### Phase 9: Testing

Test:

```text
1 → 5 → 10 → larger campaign
```

Check every status and report.

---

### Phase 10: Production

After successful testing:

```text
Brevo = campaign delivery
Hostinger = Webmail + receiving + normal email
```

---

# 57. Final Architecture

The final system should look like this:

```text
                         ┌──────────────────────┐
                         │        CRM           │
                         │                      │
                         │ Contacts             │
                         │ Lists                │
                         │ Segments              │
                         │ Templates             │
                         │ Campaigns             │
                         │ Scheduling            │
                         │ Tracking              │
                         │ Reports               │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Supabase Worker      │
                         │                      │
                         │ Queue                │
                         │ Personalization      │
                         │ Tracking             │
                         │ Retry                │
                         │ Provider Selection   │
                         └──────────┬───────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
                     ▼                             ▼
             ┌───────────────┐             ┌───────────────┐
             │   Hostinger   │             │     Brevo     │
             │   Provider    │             │   Provider    │
             └───────┬───────┘             └───────┬───────┘
                     │                             │
                     ▼                             ▼
               Email delivery                Email delivery
```

And receiving:

```text
Recipient Reply
      │
      ▼
Hostinger Mailbox
      │
      ▼
Existing Incoming Webhook
      │
      ▼
CRM Webmail
```

---

# 58. Final Decision

The implementation should **not** replace your CRM campaign system.

Instead, only replace this part:

```text
Current:

CRM Worker
    ↓
Hostinger Mail API
    ↓
Recipient
```

with:

```text
New:

CRM Worker
    ↓
Email Provider Abstraction
    ↓
Brevo Provider
    ↓
Brevo API
    ↓
Recipient
```

Everything above the provider layer remains yours.

Everything related to receiving remains Hostinger.

That gives you:

```text
CRM ownership
      +
Brevo delivery
      +
Hostinger receiving
      +
Existing Webmail
      +
Existing tracking
      +
Existing campaign reports
```

This is the cleanest architecture for what you've already built.
