# Implementation Plan: Multi-Company WhatsApp Integration for Digify CRM

## 1. Project Objective

Implement a complete WhatsApp Web-style messaging interface inside the existing **Digify CRM → Business CRM** section using the Baileys library.

The feature must allow every company registered in Business CRM to connect its own WhatsApp account independently by scanning a QR code. Each company must have access only to its own connected WhatsApp account, chats, contacts, messages, and session.

**Primary objective:** Create a polished, responsive, fully functional WhatsApp-style experience, not a basic chat widget or a redesigned CRM dashboard.

### Mandatory Documentation

Before implementing anything, read these resources yourself:

- Baileys Quickstart: https://baileys.wiki/quickstart
- Official Baileys GitHub repository: https://github.com/WhiskeySockets/Baileys
- Baileys documentation: https://baileys.wiki/docs/intro/

Study the current APIs, connection lifecycle, authentication state, event handling, history synchronization, media handling, message receipts, contacts, chats, and call-related capabilities.

Do not blindly copy old tutorials. Verify that the methods and event names you use exist in the installed Baileys version. If a feature is unsupported or unreliable, document that limitation and implement the best available alternative.

---

## 2. Inspect the Existing Project First

Before writing code:

1. Inspect the entire existing Digify CRM project structure.
2. Identify the framework, routing, authentication, database, current Business CRM modules, company model, user roles, and existing UI component library.
3. Find how companies are created and identified, and determine how the currently authenticated user is authorized to access them.
4. Identify existing realtime communication, caching, file storage, and API patterns.
5. Review the existing hosting environment and determine how a persistent Node.js WebSocket connection can be maintained.

Reuse existing architecture wherever practical. Do not create duplicate company records, a second authentication system, or unnecessary infrastructure.

Do not modify unrelated CRM sections.

## 3. Company-Specific WhatsApp Connections

Each company must have an independent WhatsApp connection.

Example:

- Company A connects its own WhatsApp number.
- Company B connects a different WhatsApp number.
- Company C can connect its own account without affecting A or B.

### Connection management UI

Inside each company's Business CRM area, add a WhatsApp section with:

- Connection status: Connected, Connecting, Disconnected, Reconnecting, or Logged Out.
- Connected WhatsApp phone number.
- Profile name and profile picture, where available.
- Connect WhatsApp button.
- QR code linking flow.
- QR expiration and refresh handling.
- Connection health and last-connected information.
- Reconnect button.
- Disconnect button.
- Clear confirmation when disconnecting.
- Useful loading, success, and error states.

Display the QR code in a polished modal or dedicated connection screen. Update it automatically when Baileys provides a new QR code.

After scanning, wait for actual connection confirmation before showing the account as connected.

### Session isolation

Every connection must be mapped to a stable internal company ID and its own WhatsApp session.

Requirements:

- Never share authentication credentials between companies.
- Never use a single global socket for multiple companies.
- Support independent reconnection and session recovery.
- Prevent one company from accessing another company's account.
- Revalidate permissions on every backend request.
- Do not expose WhatsApp session credentials, encryption keys, or unrestricted filesystem access to the frontend.

Store authentication credentials securely and encrypted at rest. Use atomic, concurrency-safe credential updates and restrict access to the session storage.

Logging out or disconnecting one company must not affect any other company's session.

## 4. WhatsApp-Style UI/UX

Create a premium, polished interface inspired by WhatsApp Web's familiar interaction patterns.

Do not simply place a chat box inside the existing CRM dashboard. Build the messaging workspace with proper spacing, typography, responsive behavior, message bubbles, contact navigation, and interaction states.

Preserve the existing CRM design system outside this module.

### Desktop layout

Implement a three-part messaging workspace:

**Left sidebar: Chat navigation**

- Company/account identity.
- Profile and connection status.
- Search chats and contacts.
- All chats.
- Unread chats.
- Favorites or starred chats, if supported.
- Archived chats, if supported.
- Chat list with profile photo, contact name, last message, timestamp, unread badge, and message status.
- Context menu for supported chat actions.

**Middle panel: Conversation**

- Contact profile picture and name.
- Phone number when available.
- Online or last-seen information only when actually available and permitted.
- Message history.
- Incoming and outgoing message bubbles.
- Message timestamps.
- Sent, delivered, and read indicators where supported.
- Date separators.
- Unread message divider.
- Typing indicators where supported.
- Reply and quoted-message previews.
- Message reactions where supported.
- Scroll-to-latest control.
- Message composer fixed to the bottom.
- Loading states for history and media.

**Optional right-side contact panel**

Provide a collapsible details panel with:

- Contact name and phone number.
- Profile picture.
- Available business or contact details.
- Shared media and documents, if retrievable.
- Relevant CRM information, if an existing contact relationship exists.

Do not invent contact information or display fake online statuses.

### Responsive behavior

On mobile and smaller screens:

- Show the chat list first.
- Open the conversation as a separate view.
- Provide a clear back-navigation control.
- Keep the composer accessible.
- Ensure menus, media previews, and modals remain usable.

The interface must feel complete on desktop without becoming unusable on mobile.

## 5. Contact and Chat Synchronization

On connection, synchronize the information Baileys makes available from WhatsApp.

Implement event handlers for the supported chat, contact, message, receipt, and history updates.

Requirements:

- Load available historical chats and messages.
- Load available contacts and profile information.
- Resolve phone numbers and WhatsApp identifiers into consistent internal contact records.
- Handle individual chats and group chats separately.
- Update the chat list immediately when a new message arrives.
- Update last-message previews and timestamps.
- Move chats into the correct order when activity changes.
- Maintain unread counts.
- Handle incoming and outgoing messages.
- Deduplicate messages using stable WhatsApp message identifiers and account scope.
- Handle message edits, deletions, reactions, and receipt updates wherever supported.
- Preserve message ordering and pagination.
- Support reconnects without creating duplicate chats or messages.

### Historical data expectations

Attempt to retrieve available WhatsApp history using the supported synchronization options.

However, do not assume Baileys can retrieve every old message, every contact, or the entire history from every connected account. History availability depends on WhatsApp synchronization behavior and the linked device.

Implement:

- Initial synchronization progress.
- Lazy loading of older messages.
- Pagination where supported by the available store.
- A useful empty state when history is unavailable.
- Recovery after interruption.
- A clear distinction between loading history and having no messages.

Do not make the whole CRM dependent on a complete historical synchronization.

## 6. Messaging Features

Implement the following wherever the installed Baileys version and WhatsApp protocol support them.

### Text messaging

- Send and receive text messages.
- Enter to send and Shift + Enter for a new line.
- Multiline composition.
- Reply to a specific message.
- Copy message text.
- Forward messages where supported.
- Display sending, sent, delivered, read, and failed states where available.
- Retry failed sends safely without accidental duplicates.
- Handle long messages and links.
- Display link previews where supported.

### Media messaging

Support the appropriate message types and preview formats for:

- Images.
- Videos.
- Audio messages and voice notes.
- Documents and attachments.
- Stickers.
- Location messages.
- Contact cards.
- Captions and supported media metadata.

Provide file selection, upload progress, image previews, document details, download controls, and useful error messages.

Use streaming or bounded-memory media processing where practical. Avoid loading large files entirely into server memory.

Respect file-size limits, validate MIME types, and safely handle downloaded content.

### Message status and read receipts

- Mark incoming messages as read when appropriate.
- Update message status when receipt events arrive.
- Display read indicators only when the relevant information is actually available.
- Maintain unread counts independently.
- Avoid repeatedly marking the same messages as read.

### Contact and profile information

Display contact names from available contact data, WhatsApp profile information, and saved CRM contact relationships.

Use a sensible fallback hierarchy:

1. Saved contact name.
2. Available WhatsApp push name or verified profile information.
3. Phone number or a group name.

Do not assume that every account exposes every contact's full profile or last-seen information.

## 7. Calling and Advanced WhatsApp Features

Investigate Baileys' current call-related APIs and events before implementation.

The interface may display incoming call notifications or call information if the library exposes the necessary events.

However, **do not promise full WhatsApp voice/video calling, call answering, or initiating calls unless the installed library version demonstrably supports those operations end to end.**

If supported, implement the available functionality with suitable permission handling and clear call states. Otherwise, display an honest unavailable state rather than a fake call button.

Apply the same rule to:

- Message editing and deletion.
- Reactions.
- Pinning and archiving.
- Group administration.
- Broadcasts.
- Polls and other specialized message types.

Implement only what can be reliably supported by the current API and the linked account.

## 8. Caching and Temporary Storage

The user does not require a permanent database containing every WhatsApp conversation.

Use a cache-first architecture that preserves the live WhatsApp connection while minimizing persistent chat storage.

### Cache layer

Use an appropriate server-side cache/store for:

- Recent chats.
- Recent messages.
- Contact details.
- Profile pictures and thumbnails.
- Chat ordering and unread counts.
- Message status updates.
- Frequently accessed conversation metadata.

Use the existing project's caching technology if suitable. Otherwise, evaluate an in-memory store or Redis-compatible cache according to the hosting environment.

Implement:

- Cache expiration and eviction.
- Per-company cache namespaces.
- Memory limits.
- Duplicate-event protection.
- Reconnection recovery.
- Incremental cache updates.
- Pagination and bounded history.
- Safe cleanup when an account disconnects.
- Cache invalidation after relevant updates.

### Storage policy

Persist only the information required for authentication, connection management, security, and minimal operational recovery.

Do not persist the complete message history permanently in the CRM database unless explicitly necessary for an existing feature.

Temporary cache data may disappear after a restart. The UI must recover gracefully by requesting available information from WhatsApp again.

Important: Do not confuse temporary chat caching with Baileys authentication state. Session credentials must survive restarts securely; otherwise, users may have to scan the QR code again.

## 9. Backend Architecture

Build the integration using a clean separation of responsibilities.

Suggested logical components:

- WhatsApp connection manager.
- Company-to-session registry.
- Authentication/session storage.
- Baileys event handlers.
- Chat and message cache.
- Message sending service.
- Contact and profile service.
- Realtime event delivery to the CRM frontend.
- Media handling service.
- Connection health monitoring.
- Authorized API endpoints.

Maintain one managed connection per connected company account, with lifecycle controls to prevent duplicate sockets.

The frontend must receive live updates using the project's existing realtime mechanism or an appropriate authenticated WebSocket/SSE implementation.

Do not expose Baileys directly to the browser. All WhatsApp operations must go through authorized backend services.

### Hosting requirements

Baileys requires a persistent Node.js process and WebSocket connection. Verify the current hosting limitations before selecting the deployment strategy.

If the existing hosting cannot maintain these connections, implement a separate compatible worker or connector service without unnecessarily migrating the existing CRM.

Do not silently substitute minute-based cron jobs for a persistent connection.

The solution must support multiple companies, process restarts, connection recovery, health checks, and graceful shutdown.

## 10. Security and Permissions

Implement the following:

- Company-scoped authorization on every operation.
- Encrypted session credentials at rest.
- Strict access controls for QR codes and connection status.
- Protection against cross-company chat and media access.
- Request validation and rate limiting.
- Safe file handling.
- Redaction of sensitive data from logs.
- Explicit disconnect and logout handling.
- Protection against duplicate concurrent connections.
- Cleanup of expired temporary media and cached data.

A user must never be able to change a company ID in a request and gain access to another company's WhatsApp account.

## 11. Error Handling and Connection Reliability

Handle:

- QR expiration.
- Login and authentication errors.
- Logged-out sessions.
- Temporary network failures.
- WhatsApp connection closures.
- Reconnection backoff.
- Failed message delivery.
- Missing or unavailable media.
- Interrupted synchronization.
- Process restarts.
- Corrupted or incomplete session state.

Display understandable error messages in the UI. Do not expose raw stack traces, credentials, or internal session information.

Reconnection must be controlled and must not create multiple active connections for the same account.

## 12. Implementation Phases

### Phase 1: Project inspection and technical validation

- Read the documentation.
- Inspect the existing CRM architecture.
- Validate hosting compatibility.
- Identify supported Baileys features.
- Define session isolation and cache strategy.

### Phase 2: Multi-company connection system

- Implement company-specific sessions.
- Generate and display QR codes.
- Handle connection state and reconnection.
- Implement secure authentication storage.
- Verify account isolation.

### Phase 3: Messaging backend

- Implement chat, contact, message, receipt, and history events.
- Implement text and media sending.
- Add message deduplication.
- Implement temporary cache and synchronization recovery.

### Phase 4: Complete WhatsApp-style interface

- Build the chat sidebar.
- Build the conversation panel.
- Implement message bubbles and status indicators.
- Add search, contact details, media previews, menus, and responsive layouts.
- Connect every control to real backend functionality.

### Phase 5: Advanced capabilities

- Implement supported reactions and message operations.
- Add supported group functionality.
- Investigate and implement available call-related features.
- Handle unavailable capabilities honestly.

### Phase 6: Testing and production readiness

Test with at least two independent company accounts.

Verify that:

- Each company can connect its own number.
- Messages appear in the correct workspace.
- Incoming messages appear without refreshing the page.
- Sending, receipts, media, and chat updates work.
- Available history loads correctly.
- Temporary cache recovery works.
- Sessions survive process restarts.
- Disconnecting one company leaves all other companies connected.
- No cross-company data leakage occurs.
- The UI handles network interruptions and empty states.
- The feature works across desktop and mobile layouts.

## 13. Acceptance Criteria

The feature is complete only when:

1. Every company can independently link its WhatsApp account.
2. The connection remains active under the supported deployment environment.
3. The interface is polished and closely follows WhatsApp Web's familiar layout and interaction patterns.
4. Supported messaging and media operations work end to end.
5. Available chat history and contacts can be synchronized.
6. Temporary cache is implemented with clear persistence boundaries.
7. Connection credentials are securely stored.
8. All company-level authorization checks are enforced.
9. Reconnection and process recovery work reliably.
10. Unsupported WhatsApp features are documented rather than falsely presented as functional.
11. All existing CRM features continue to work without regression.

## Final Instruction

Implement this feature in the existing Digify CRM repository, not as a standalone demo or disconnected prototype.

Prioritize a fully functional backend and a premium WhatsApp-style frontend. Do not stop after creating a mockup, QR modal, or static chat screen.

Read the documentation, verify the installed Baileys APIs, implement the integration, test it against real linked accounts, and report exactly which features work, which are limited by WhatsApp or Baileys, and which deployment requirements remain.

Preserve all unrelated CRM functionality and avoid unnecessary architectural changes.