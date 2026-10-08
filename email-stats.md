You need to fix the Campaign/Email Campaign statistics and tracking system properly. Do NOT just patch the displayed numbers. First inspect the current campaign tracking architecture, database tables, Edge Functions, send flow, webhook handling, tracking pixel, click redirect, reply detection, and bounce handling.

## 1. Simplify the Campaign Stats UI

The current stats section shows too many metrics:

Recipients
Queued
Processing
Sent
Failed
Delivered
Bounced
Opened
Clicked
Replied

This is too much for the main campaign overview.

The main campaign stats should show only the important user-facing metrics:

* Recipients
* Sent
* Delivered
* Opened
* Clicked
* Replied
* Bounced
* Failed

Move internal processing states such as `Queued`, `Processing`, and possibly `Failed` into a secondary/details area if they are needed for debugging/admin purposes.

Do not remove the underlying database information. Only simplify the primary UI.

## 2. The Current Tracking Is NOT Reliable

There is currently a serious tracking issue:

Sometimes an email shows as `Opened` immediately when it is sent, even though I have NOT opened the email in Gmail.

Sometimes it does not happen.

Click tracking is also inconsistent.

Reply tracking is inconsistent.

Bounce tracking is missing or incorrect.

Also, bounced emails are currently being counted/displayed as `Sent`, and `Delivered` is sometimes showing even when there is no reliable delivery confirmation.

Do NOT assume that sending an email means it was delivered.

Do NOT assume that a request to the tracking pixel means a human opened the email.

Do NOT assume that a click automatically means a genuine recipient click.

The tracking system needs to distinguish these states correctly.

---

# 3. Implement Proper Email Lifecycle Tracking

Use the following lifecycle:

`Queued → Sending → Sent → Delivered → Opened → Clicked → Replied`

With a separate failure/bounce path:

`Sending → Failed`

`Sent → Bounced`

A bounced email must NOT be treated as successfully delivered.

The database should keep the lifecycle states independently rather than overwriting one state with another.

For example:

* `sent_at`
* `delivered_at`
* `bounced_at`
* `opened_at`
* `clicked_at`
* `replied_at`
* `failed_at`

Also maintain appropriate event records so multiple events can be audited.

Do not use a single boolean such as:

`opened = true`

as the entire tracking system.

Use an event-based approach.

---

# 4. SENT Must Mean Successfully Accepted by the Sending Provider

`Sent` should mean that the sending provider/API successfully accepted the email for delivery.

It should NOT mean:

* the recipient received it
* Gmail delivered it
* the recipient opened it
* the recipient clicked it

When the CRM sends the email through the existing sending provider:

1. Create the campaign recipient/event record.
2. Mark it as sending/processing.
3. Call the provider.
4. If the provider accepts the message, store the provider's message ID.
5. Set `sent_at`.
6. Set status to `sent`.

If the provider rejects the email immediately:

* status = failed
* do not mark it as sent.

Store the provider message ID because it is essential for later delivery/bounce tracking.

---

# 5. DELIVERY Tracking

Do NOT automatically set:

`delivered = true`

after sending.

Delivery must come from an actual provider delivery event/webhook whenever the provider supports it.

The architecture should support:

`sent → delivered`

only when a real delivery confirmation/event is received.

If the provider does not provide a reliable delivery event for the current sending method, then DO NOT fake delivery.

In that situation:

* Sent = confirmed
* Delivered = unknown/not confirmed

This is much better than displaying fake delivery numbers.

---

# 6. BOUNCE Tracking

Implement proper bounce handling.

Bounces can be:

* hard bounce
* soft/temporary bounce
* rejected
* mailbox unavailable
* invalid recipient
* blocked
* other provider delivery failures

Whenever the sending provider gives a bounce/delivery-failure webhook or event:

1. Find the campaign recipient using the provider message ID.
2. Store the bounce event.
3. Set `bounced_at`.
4. Set the appropriate bounce status.
5. Store the bounce type/reason/message where available.
6. Do NOT count the recipient as delivered.
7. Do NOT remove the original sent event.
8. The UI should show the email as `Bounced`, not successfully delivered.

Important:

A bounced email may have been accepted by the sending provider first.

Therefore:

`Sent = yes`

and later:

`Bounced = yes`

can both be true.

But:

`Delivered = yes`

must not be assumed simply because `Sent = yes`.

The UI should calculate these metrics from the correct event/state rather than blindly counting all sent records.

---

# 7. OPEN Tracking Must Be Fixed Properly

The current tracking pixel is producing false opens.

This is very important.

An image request does NOT necessarily mean a human opened the email.

Gmail, Apple Mail, Outlook and security/scanning systems can automatically request images.

Email security scanners can also preload tracking pixels.

Therefore the current logic must NOT simply do:

`pixel request → human opened`

Instead implement a robust open-event system.

Each recipient email should receive a unique tracking URL/token, for example:

`/api/email/track/open/<unique-token>`

The token must identify:

* campaign
* recipient
* message
* tracking event

The tracking endpoint should record:

* timestamp
* recipient/message ID
* user agent
* IP where appropriate
* relevant request headers if available

Then implement bot/scanner filtering.

Known email-security/scanning behavior should be detected where possible using:

* user-agent
* request characteristics
* timing
* repeated requests
* known scanner patterns
* hosting/provider security systems

Do NOT treat every first pixel request as a guaranteed human open.

Instead maintain two concepts if necessary:

`open_event`

and

`human_open` / `filtered_open`

The campaign UI should use the best available filtered metric.

Important: explain in code comments/documentation that **email opens can never be guaranteed to be 99% accurate** because email clients and security systems intentionally interfere with tracking.

The goal should be highly reliable event tracking, not pretending that automated image fetching is a human action.

---

# 8. Avoid False Immediate Opens

Specifically investigate why the email sometimes becomes:

`Sent + Opened`

immediately after sending.

Trace the complete flow:

Send email
↓
Provider
↓
Email HTML
↓
Tracking pixel
↓
Tracking endpoint
↓
Database

Check whether:

* the sending provider scans the HTML
* Gmail/Outlook scans the email
* the application itself requests the tracking URL
* an email preview endpoint requests the pixel
* campaign preview accidentally triggers tracking
* the tracking URL is being fetched by a server-side process
* link/image validation is triggering the endpoint
* a bot/security scanner is being counted as an open

Do NOT simply add an arbitrary delay such as "ignore opens within 10 seconds".

That can hide legitimate opens and does not solve the underlying problem.

Identify the actual source of the request.

---

# 9. CLICK Tracking

Click tracking should work through a unique redirect URL.

Example:

Original:

`https://example.com/page`

Email contains:

`https://crm-domain.com/api/email/track/click/<unique-token>`

The redirect endpoint should:

1. Validate the tracking token.
2. Identify campaign + recipient + original URL.
3. Record the click event.
4. Store timestamp and request metadata.
5. Redirect the user to the original URL.

Again, do not simply treat every HTTP request as a human click.

Email security systems can scan links automatically.

Implement filtering for obvious automated scanners/bots.

Store:

* first click
* total click events
* unique click
* timestamp
* URL clicked

The campaign UI should primarily show:

`Clicked`

based on a filtered/unique recipient click event.

---

# 10. Reply Tracking

Reply tracking should NOT depend on click/open tracking.

Implement reply detection independently.

A reply should be detected from the actual incoming email.

Use the existing CRM Webmail/Hostinger incoming email architecture.

Match incoming replies using appropriate email headers whenever possible:

* `In-Reply-To`
* `References`
* original `Message-ID`
* campaign/message identifier
* recipient/sender address

If the campaign system adds a safe unique identifier to the outgoing message, use that to associate replies with the campaign.

Do NOT simply say:

"email received from this address = reply"

because the recipient could send an unrelated email.

A reply event should only be associated with a campaign when there is enough evidence that it belongs to that campaign.

When a valid reply is detected:

* create a `replied` event
* set `replied_at`
* associate the incoming message ID
* associate campaign + recipient
* do not duplicate the reply if the same incoming email is processed again.

---

# 11. Event-Based Tracking Database

Inspect the existing schema first.

If the current implementation uses only booleans, migrate it toward an event-based structure.

Conceptually:

`campaign_email_events`

Fields should include something similar to:

* id
* campaign_id
* recipient_id
* message_id
* event_type
* event_timestamp
* provider_event_id
* metadata
* user_agent
* ip_address where appropriate
* created_at

Possible event types:

* queued
* sending
* sent
* failed
* delivered
* bounced
* opened
* clicked
* replied

Add unique/idempotency protection where appropriate.

The same provider webhook or email event must not create duplicate events.

---

# 12. Idempotency Is Mandatory

Webhook handlers and tracking endpoints can be called multiple times.

Therefore:

If the same delivery webhook arrives twice:

Do NOT create two delivery events.

If the same bounce webhook arrives twice:

Do NOT create two bounce events.

If the same reply is processed twice:

Do NOT create two reply events.

If the same click is scanned multiple times:

Store the raw events if needed, but calculate unique clicks separately.

Use:

* provider event IDs
* message IDs
* recipient IDs
* tracking tokens
* unique database constraints

where appropriate.

---

# 13. Campaign Stats Must Be Calculated Correctly

Do not simply calculate:

`Sent = all campaign recipients`

Instead calculate every metric from the event/state data.

For example:

### Recipients

Total intended recipients.

### Sent

Recipients with a confirmed sending-provider acceptance.

### Delivered

Recipients with a confirmed delivery event.

### Bounced

Recipients with a confirmed bounce event.

### Opened

Recipients with a valid/filtered open event.

### Clicked

Recipients with a valid/filtered click event.

### Replied

Recipients with a verified campaign reply.

One recipient should count only once in each unique metric.

Example:

One recipient opens an email 5 times.

That should be:

`Opened = 1`

not:

`Opened = 5`

Similarly, if one recipient clicks 10 times:

`Clicked = 1`

for the unique recipient metric.

You can separately expose total events if useful.

---

# 14. Correct Status Priority

Make sure the UI does not incorrectly classify states.

For example, if a message was sent and later bounced:

Status should show:

`Bounced`

not just `Sent`.

If it was sent and delivered:

`Delivered`

If delivered and opened:

`Opened`

If opened and clicked:

`Clicked`

If replied:

`Replied`

But retain all underlying timestamps/events.

Suggested display priority:

`Replied > Clicked > Opened > Delivered > Bounced > Sent > Failed`

However, do NOT use this display priority to destroy the underlying event history.

A recipient can have:

`Sent + Bounced`

or:

`Sent + Delivered + Opened + Clicked + Replied`

depending on actual events.

---

# 15. Do Not Fake Metrics

This is critical.

Never automatically set:

`Delivered = true`

because an email was sent.

Never automatically set:

`Opened = true`

because an email was sent.

Never automatically set:

`Clicked = true`

because a tracking URL was requested by an obvious scanner.

Never automatically set:

`Replied = true`

because an incoming email happened to come from the same address.

The system must use actual evidence.

---

# 16. Existing Email Architecture Must Remain

Do NOT replace the existing campaign system.

Do NOT replace:

* CRM Webmail
* Hostinger normal email flow
* existing campaign UI
* campaign queue
* existing Supabase Edge Function worker
* existing sender configuration
* existing tracking/reporting architecture unless necessary
* existing campaign templates
* existing email provider integration

Inspect the existing implementation and modify the current architecture cleanly.

If Brevo is currently being used for campaign delivery, use its official delivery/bounce/webhook events where available.

Normal CRM email/Webmail functionality must remain unchanged.

---

# 17. Testing Requirements

After implementation, test at least these scenarios:

### Test 1: Normal send

Send email to Gmail.

Expected:

`Sent = 1`

`Delivered = 0` initially until a real delivery event exists.

No fake open.

### Test 2: Gmail receives email but user does not open it

Expected:

No guaranteed human `Opened` event.

If Gmail/security infrastructure requests the pixel automatically, it must be filtered as automated where identifiable.

### Test 3: User opens email

Expected:

`Opened = 1`

Only one unique opened recipient.

### Test 4: User clicks link

Expected:

`Clicked = 1`

Redirect works correctly.

### Test 5: User clicks multiple times

Expected:

`Clicked = 1`

for unique recipient metric.

Raw click events may be greater than 1.

### Test 6: User replies

Expected:

`Replied = 1`

The actual incoming reply must be associated with the correct campaign.

### Test 7: Invalid email

Send to an invalid/nonexistent address.

Expected:

`Sent = 1` if provider accepted it initially.

Then when bounce event arrives:

`Bounced = 1`

and it must NOT be counted as delivered.

### Test 8: Duplicate webhook

Send the same webhook twice.

Expected:

Only one logical delivery/bounce event.

### Test 9: Existing email template

Use the new rich-text email template editor and send the campaign.

Tracking must still work with:

* headings
* bold text
* paragraphs
* hyperlinks
* buttons
* tracking links
* tracking pixel

Do not break HTML email formatting.

---

# 18. Important Accuracy Requirement

Do not claim that email open/click tracking can be "99% accurate" in the sense of identifying exactly when a human opened or clicked an email.

That is technically impossible across Gmail, Outlook, Apple Mail, security scanners, privacy systems, proxy services and automated link/image scanners.

The implementation should instead aim for:

* highly reliable provider delivery/bounce events
* highly reliable send status
* robust click tracking with bot/scanner filtering
* robust reply matching
* open tracking with automated-request filtering
* event-level auditability
* idempotent webhook processing

The final implementation should make the metrics as accurate as the underlying email ecosystem allows.

---

# 19. Before Finishing

First inspect the existing code and database.

Identify exactly:

1. How emails are currently sent.
2. What provider sends campaign emails.
3. How provider message IDs are stored.
4. How the current open pixel works.
5. How click tracking works.
6. How replies are currently detected.
7. Whether delivery/bounce webhooks already exist.
8. Which Supabase Edge Functions are involved.
9. Which database tables/columns currently store campaign statistics.
10. Why `Opened` can become true immediately after sending.
11. Why bounced emails are being represented incorrectly.
12. Why `Delivered` is being shown without reliable delivery confirmation.

Then implement the fix within the existing architecture.

Do not just modify the frontend numbers.

At the end, provide a concise implementation report listing:

* files changed
* database migrations
* Edge Functions changed
* webhook endpoints added/changed
* tracking flow
* bounce handling
* reply handling
* bot/scanner filtering
* UI changes
* tests performed

Most importantly, verify the actual database records and event flow after testing. The dashboard must reflect real events, not optimistic guesses made by a frontend having a particularly creative afternoon.
