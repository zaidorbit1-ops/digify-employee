# CRM Internal Chat & Real-Time Messaging System
## AI Agent Implementation Specification

## 1. Objective

Build a complete, production-ready **Internal Chat / Office Messaging System** inside the existing Next.js CRM.

The feature must feel modern, fast, polished, intuitive, and mobile-friendly. Think of the usability patterns of Messenger/Slack/Teams, but keep the visual language consistent with the existing CRM.

The system is for internal office communication only.

### Core requirements

- Real-time 1-to-1 messaging
- Real-time group messaging
- Workspaces
- Workspace channels
- Real-time notifications
- Unread message counts
- Online/offline presence
- Typing indicators
- Message timestamps
- Message read status
- File/image attachments
- Mobile responsive chat
- Desktop chat experience
- Floating Messenger-style chat bubble
- Chat accessible from CRM sidebar
- Superadmin controls
- Employee-to-employee messaging
- Secure permissions using Supabase RLS
- No page refresh required for messages or notifications

---

# 2. Existing Technology

Use the existing CRM stack.

Expected stack:

- Next.js
- React
- Supabase
- PostgreSQL
- Supabase Realtime
- Supabase Storage
- Existing CRM authentication/users/employees

### IMPORTANT

Do NOT introduce Firebase.

Use Supabase for:

- Database
- Authentication
- Realtime
- Presence
- Storage

Do not create a separate chat backend unless there is a demonstrated technical requirement.

---

# 3. Main Navigation

Add a permanent item to the CRM sidebar:

```text
💬 Internal Chat
```

It should show an unread badge when messages are unread.

Example:

```text
💬 Internal Chat    4
```

Clicking it opens the complete chat page.

The sidebar item must work on desktop and mobile.

---

# 4. Floating Chat Launcher

In addition to the sidebar item, create a **floating chat button at the bottom-right of the CRM**.

Example:

```text
                                      ┌─────────┐
                                      │ 💬  3   │
                                      └─────────┘
```

Requirements:

- Fixed to bottom-right
- Always visible while logged in
- Does not obstruct important CRM controls
- Modern rounded design
- Subtle shadow
- Smooth hover/press animation
- Unread count badge
- Accessible with keyboard
- Mobile-friendly
- Respect safe-area spacing on mobile

### When clicked

The floating button should open the chat interface.

On desktop, it can open a Messenger-style chat panel or route to the Internal Chat page depending on the current context.

On mobile, it should open the full-screen/mobile chat interface.

---

# 5. Incoming Message Floating Bubble

When another employee sends a new message and the recipient is not currently viewing that conversation, show a floating notification bubble near the bottom-right.

Example:

```text
┌────────────────────────────────────┐
│ 👤 Ahmed                           │
│ "Client ka update ready hai..."    │
│                             2 min  │
└────────────────────────────────────┘
```

Requirements:

- Appear in real time
- Show sender avatar
- Show sender name
- Show message preview
- Show timestamp
- Show unread count if multiple messages arrive
- Auto-dismiss after a reasonable period, while preserving unread status
- Clicking it opens the correct conversation
- Multiple incoming messages should stack intelligently
- Do not cover the main chat input or important buttons
- Provide subtle enter/exit animations
- Respect mobile screen width

This should feel similar to modern Messenger-style floating notifications.

---

# 6. Main Chat Page

Create a dedicated route such as:

```text
/internal-chat
```

Desktop layout:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Internal Chat                                      🔍  ⚙            │
├──────────────────────┬──────────────────────────────────────────────┤
│ Search conversations │                                              │
│                      │  Development Team                            │
│ DIRECT MESSAGES      │  8 members                                   │
│ 👤 Ahmed         2   │                                              │
│ 👤 Ali               │  ─────────────────────────────────────────   │
│ 👤 Sara              │                                              │
│                      │  Ahmed                                       │
│ GROUPS               │  API ka update ready hai.                    │
│ 👥 Development       │                                  10:32 AM    │
│ 👥 Marketing      5  │                                              │
│                      │  Zaid                                        │
│ WORKSPACES           │  Great, main testing start karta hun.        │
│ 📁 Website Project   │                                  10:33 AM    │
│ 📁 CRM Project       │                                              │
│                      │                                              │
│ + New Chat           │  ─────────────────────────────────────────   │
│ + New Group          │  📎  Type a message...                  ➤    │
└──────────────────────┴──────────────────────────────────────────────┘
```

---

# 7. Chat Sidebar

The left chat sidebar must be highly usable.

Include:

### Search

Search:

- Employee names
- Group names
- Workspace names
- Conversation names

### Sections

```text
DIRECT MESSAGES
GROUPS
WORKSPACES
```

### Conversation item

Each item should show:

- Avatar
- Name
- Last message preview
- Timestamp
- Unread badge
- Online indicator where applicable
- Pinned indicator if implemented

Example:

```text
🟢 Ahmed
   Client update ready...          2
```

Unread conversations should have stronger visual emphasis.

---

# 8. Direct Messages

Every employee should be able to message another employee.

Example:

```text
Employees
--------------------
Zaid
Ahmed
Ali
Sara
```

Clicking an employee opens the direct conversation.

Rules:

- One unique direct conversation between two employees
- Do not create duplicate direct conversations
- Existing conversation must be reused
- Messages arrive in real time
- Read status updates in real time
- Typing indicator works in real time

---

# 9. Groups

Superadmin must be able to create groups.

Example:

```text
+ New Group

Group Name:
[ Development Team ]

Members:
☑ Zaid
☑ Ahmed
☑ Ali
☑ Sara

[ Create Group ]
```

Superadmin controls:

- Create group
- Rename group
- Add members
- Remove members
- Archive group
- Delete group where appropriate

Employees:

- Can participate in groups they belong to
- Can send messages
- Can receive messages
- Cannot manage protected group membership unless explicitly permitted

---

# 10. Workspaces

A workspace represents a larger project/team area.

Example:

```text
📁 Website Project

   # General
   # Development
   # Design
   # Testing
```

Another:

```text
📁 CRM Project

   # General
   # Backend
   # Frontend
   # Testing
```

Superadmin must be able to:

- Create workspace
- Rename workspace
- Add/remove workspace members
- Create channels
- Rename channels
- Archive channels
- Manage workspace access

Workspace members can communicate inside channels they have access to.

---

# 11. Recommended Conversation Types

Use a single conversation model with:

```text
type:
- direct
- group
- channel
```

Examples:

```text
direct
Zaid ↔ Ahmed

group
Development Team

channel
Website Project / Development
```

This keeps the architecture clean and extensible.

---

# 12. Database Architecture

Use Supabase PostgreSQL.

Recommended tables:

## conversations

```text
id
type
name
workspace_id
created_by
created_at
updated_at
```

## conversation_members

```text
id
conversation_id
user_id
joined_at
last_read_at
```

## messages

```text
id
conversation_id
sender_id
message
message_type
reply_to_message_id
created_at
updated_at
deleted_at
```

## workspaces

```text
id
name
description
created_by
created_at
updated_at
```

## workspace_members

```text
id
workspace_id
user_id
role
joined_at
```

## attachments

```text
id
message_id
file_name
file_path
file_type
file_size
created_at
```

Use Supabase Storage for actual files.

---

# 13. Realtime Architecture

Use Supabase Realtime.

The UI must subscribe to relevant conversations.

When a message is inserted:

```text
Employee A
   ↓
Next.js
   ↓
Supabase PostgreSQL
   ↓
Supabase Realtime
   ↓
Employee B / Group Members
```

The recipient must see the message without refreshing.

Do not poll the database every few seconds for normal messaging.

---

# 14. Presence

Use Supabase Realtime Presence for:

```text
🟢 Online
⚪ Offline
```

Example:

```text
Ahmed
🟢 Online
```

Presence should not require constant database writes.

---

# 15. Typing Indicator

Use Realtime events/presence rather than storing every typing event in PostgreSQL.

Example:

```text
Ahmed is typing...
```

If multiple users:

```text
Ahmed and Ali are typing...
```

Typing state should automatically disappear after the user stops typing.

---

# 16. Read / Unread System

Each conversation must maintain unread state.

Recommended mechanism:

```text
conversation_members.last_read_at
```

When a user opens the conversation and reaches the latest messages:

```text
last_read_at = current timestamp
```

Unread count should update without refresh.

Example:

```text
Ahmed                 3
Development Team      7
Marketing              1
```

---

# 17. Notifications

Implement multiple notification layers.

## A. In-app notification

When a new message arrives:

```text
💬 New message
Ahmed sent you a message
```

## B. Floating notification bubble

Show the Messenger-style bubble described earlier.

## C. Sidebar unread badge

```text
💬 Internal Chat    5
```

## D. Conversation unread badge

```text
Ahmed        2
```

## E. Browser notification

If browser notification permission is granted and the user is not actively viewing the relevant conversation, optionally show:

```text
Ahmed
Client update ready.
```

Do not request notification permission repeatedly.

---

# 18. Notification Rules

Do NOT notify a user about their own messages.

If the user is currently viewing the same conversation:

- Append message instantly
- Update read state
- Do not show redundant floating notification

If the user is on another CRM page:

- Show unread badge
- Show floating bubble
- Optionally show browser notification

If the user is offline:

- Message remains stored
- Unread state remains
- On reconnect, synchronize missed messages
- Do not lose messages

---

# 19. Message UI

Messages should be visually clean and modern.

Own messages:

```text
                         ┌──────────────────────┐
                         │ I'll check it now.   │
                         │ 10:34 AM        ✓✓   │
                         └──────────────────────┘
```

Other messages:

```text
┌──────────────────────────────┐
│ Ahmed                        │
│ Please check the quotation.  │
│ 10:33 AM                     │
└──────────────────────────────┘
```

Use:

- Rounded message bubbles
- Clear spacing
- Sender avatar where useful
- Timestamp
- Read status
- Hover actions
- Reply action
- Attachment preview

Do not make bubbles excessively large.

---

# 20. Message Actions

On hover/long press provide:

```text
Reply
Copy
Edit
Delete
```

Depending on permissions.

For mobile, use a bottom sheet or long-press action menu instead of relying on hover.

---

# 21. Replies

Allow replying to a specific message.

Example:

```text
┌──────────────────────────────┐
│ Ahmed                        │
│ Client wants the new design. │
└──────────────────────────────┘

Zaid:
┌──────────────────────────────┐
│ ↳ Ahmed: Client wants...     │
│ I'll prepare it.             │
└──────────────────────────────┘
```

Clicking the quoted message should scroll to the original message.

---

# 22. Attachments

Allow:

- Images
- PDF
- DOC/DOCX
- XLS/XLSX
- Other safe office files

Show previews where appropriate.

Example:

```text
📎 quotation.pdf
1.2 MB
[Open]
```

Images should show inline previews.

Use Supabase Storage.

Validate:

- File type
- File size
- Authentication
- Access permissions

---

# 23. Mobile UX

The system MUST be fully mobile responsive.

On mobile:

```text
┌─────────────────────────┐
│ ←  Ahmed          ⋮     │
├─────────────────────────┤
│                         │
│ Ahmed                   │
│ Hello, check this.      │
│                         │
│                  Zaid   │
│        Sure, checking.  │
│                         │
├─────────────────────────┤
│ 📎  Message...      ➤   │
└─────────────────────────┘
```

Requirements:

- Full-screen conversation on mobile
- Back button returns to conversation list
- Sticky message composer
- Keyboard-safe layout
- Touch-friendly controls
- No horizontal overflow
- Attachments usable on phone
- Long press for message actions
- Floating chat button must not block navigation

---

# 24. Desktop UX

Desktop should use a three-area mental model where appropriate:

```text
Chat list | Conversation | Optional details
```

Do not force a third panel if it makes the UI crowded.

Main priority:

1. Conversation list
2. Messages
3. Composer

Keep the interface visually calm despite many conversations.

---

# 25. Visual Design

The UI should feel:

- Premium
- Modern
- Fast
- Clean
- Professional
- Slightly playful
- Easy to understand
- Consistent with the CRM

Avoid:

- Clutter
- Excessive gradients
- Huge cards
- Too many colors
- Excessive animations
- Tiny text
- Complicated menus

Use the existing CRM design system wherever possible.

Do not create a visually disconnected mini-app.

---

# 26. Animations

Use subtle animations for:

- New message arrival
- Floating notification appearance
- Chat bubble opening
- Typing indicator
- Sidebar selection
- Unread badge
- Attachment upload
- Online status changes

Animations should be fast and subtle.

Avoid distracting continuous animations.

Respect:

```text
prefers-reduced-motion
```

---

# 27. Search

Search should support:

- Employees
- Groups
- Workspaces
- Channels
- Messages where practical

Search results should be fast.

For message search, use PostgreSQL search/indexing rather than loading all messages into the browser.

---

# 28. Security

This is critical.

Use Supabase Row Level Security.

Rules:

A user may only read messages from conversations they belong to.

A user may only insert messages into conversations they belong to.

A user may not modify another user's messages unless their role permits it.

Attachments must follow the same access rules.

Workspace members may only access their workspaces/channels.

Do not rely only on frontend checks.

Frontend permissions are UX.

RLS is security.

---

# 29. Superadmin Permissions

Superadmin:

```text
✓ Direct message any employee
✓ Create groups
✓ Manage group members
✓ Create workspaces
✓ Manage workspace members
✓ Create channels
✓ Archive channels
✓ Manage chat settings
✓ Moderate messages according to company policy
```

Important:

Superadmin administrative power should not automatically mean silently reading every private direct message unless that is an explicitly defined company requirement.

---

# 30. Performance

The chat system should remain fast with large message histories.

Implement:

- Pagination
- Infinite scroll
- Load latest messages first
- Load older messages when scrolling upward
- Database indexes
- Realtime subscriptions scoped to relevant conversations
- Optimistic message sending where safe
- Image/file size validation
- Lazy loading for attachments

Do NOT load thousands of messages at once.

---

# 31. Message Sending UX

When user sends:

1. Show message immediately with optimistic UI
2. Send to Supabase
3. Confirm successful persistence
4. Update delivery/read state
5. If sending fails, clearly show failed state
6. Allow retry

Example:

```text
Message sending...
        ↓
✓ Sent
        ↓
✓✓ Read
```

Do not silently lose failed messages.

---

# 32. Empty States

Create polished empty states.

No conversation selected:

```text
💬
Select a conversation

Choose an employee, group, or workspace
to start chatting.
```

No messages:

```text
Start the conversation

Send the first message.
```

No search results:

```text
No conversations found.
```

---

# 33. Accessibility

Support:

- Keyboard navigation
- Visible focus states
- ARIA labels
- Screen-reader friendly buttons
- Adequate contrast
- Touch-friendly controls
- Reduced motion
- Proper form labels

Chat should not depend only on color.

For example, online status should have an accessible label, not just a green dot.

---

# 34. Error Handling

Handle:

- Network disconnect
- Supabase Realtime disconnect
- Failed message
- Failed attachment
- Permission denied
- Deleted conversation
- Deleted message
- Session expiry

Show useful UI instead of generic errors.

Example:

```text
Connection lost

Messages will sync automatically when
your connection returns.
```

---

# 35. Reconnection

If the internet disconnects:

```text
Offline
```

When connection returns:

```text
Connected
Syncing...
```

Then retrieve missed messages and update unread state.

---

# 36. Suggested Component Structure

Keep components modular.

Example:

```text
components/
└── internal-chat/
    ├── ChatLayout
    ├── ChatSidebar
    ├── ChatSearch
    ├── ConversationList
    ├── ConversationItem
    ├── ChatHeader
    ├── MessageList
    ├── MessageBubble
    ├── MessageActions
    ├── MessageComposer
    ├── AttachmentPreview
    ├── TypingIndicator
    ├── OnlineIndicator
    ├── NewGroupModal
    ├── NewWorkspaceModal
    ├── WorkspaceList
    ├── ChannelList
    ├── FloatingChatButton
    ├── FloatingMessageNotification
    └── MobileChatView
```

Adjust to the project's existing component architecture rather than blindly creating duplicate patterns.

---

# 37. API / Server Actions

Follow the existing CRM architecture.

Do not expose privileged Supabase service-role credentials to the browser.

Client-side operations should use authenticated Supabase access where appropriate.

Privileged administrative operations should go through secure server-side code.

---

# 38. Database Indexes

Create indexes for common operations.

At minimum consider:

```text
messages(conversation_id, created_at)

conversation_members(user_id, conversation_id)

conversation_members(conversation_id, user_id)

workspace_members(user_id, workspace_id)
```

Also index fields used frequently for unread counts and message retrieval.

---

# 39. No Duplicate Conversations

For direct messages, enforce uniqueness logically/database-side.

If:

```text
Zaid ↔ Ahmed
```

already exists, opening Zaid → Ahmed must return the same conversation.

Never create:

```text
Zaid ↔ Ahmed #1
Zaid ↔ Ahmed #2
Zaid ↔ Ahmed #3
```

---

# 40. Implementation Order

Implement in this order:

### Phase 1
- Database schema
- RLS
- Direct messages
- Basic chat UI
- Real-time messaging

### Phase 2
- Groups
- Superadmin group management
- Workspace
- Channels

### Phase 3
- Unread counts
- Read status
- Typing indicator
- Presence
- Realtime notifications
- Floating chat button

### Phase 4
- Attachments
- Image previews
- Replies
- Edit/delete
- Message search

### Phase 5
- Mobile optimization
- Offline/reconnection
- Performance optimization
- Accessibility
- UX polish

---

# 41. Acceptance Criteria

The feature is NOT complete until all of these work:

- [ ] Superadmin can create groups
- [ ] Superadmin can create workspaces
- [ ] Superadmin can create workspace channels
- [ ] Superadmin can manage members
- [ ] Employees can DM each other
- [ ] Employees can participate in authorized groups
- [ ] Employees can participate in authorized workspace channels
- [ ] Messages appear in real time
- [ ] No refresh is required
- [ ] Unread counts update in real time
- [ ] Read status works
- [ ] Online status works
- [ ] Typing indicator works
- [ ] Floating chat button works
- [ ] Incoming floating notification works
- [ ] Clicking notification opens correct chat
- [ ] Sidebar badge works
- [ ] Attachments work
- [ ] Mobile layout works
- [ ] Desktop layout works
- [ ] Reconnection works
- [ ] RLS prevents unauthorized access
- [ ] Direct chats do not duplicate
- [ ] Large message history is paginated
- [ ] Failed messages can be retried
- [ ] No service-role key is exposed client-side

---

# 42. Final UX Goal

The final experience should feel like:

```text
CRM
+
Messenger-style direct messaging
+
Slack-style groups/workspaces/channels
+
Real-time notifications
```

But it must remain a native part of the CRM rather than looking like an unrelated third-party application.

The user should be able to:

```text
Open CRM
   ↓
See unread chat badge
   ↓
Click Internal Chat
   ↓
Select employee/group/workspace
   ↓
Message instantly
   ↓
Receive replies instantly
   ↓
See notifications without leaving CRM
```

The entire system should be polished, responsive, secure, and production-ready.

Do not stop at a visual mockup. Implement the complete functional flow, database, permissions, realtime subscriptions, notifications, responsive UI, error handling, and testing.
