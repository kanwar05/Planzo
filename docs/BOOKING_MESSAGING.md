# Booking messaging

Planzo now supports private text conversations between a booking's customer and vendor. MongoDB persistence and REST history are authoritative; Socket.IO supplies prompt delivery hints, typing and conversation presence. Existing booking/quotation state machines, reservations, authentication and acceptance notifications remain in place.

## User workflow

- Customer booking cards offer **Message Vendor**; vendor cards offer **Message Customer**, with unread badges and dashboard totals. The protected `/bookings/:bookingId/messages` page preserves a safe return destination through login.
- The page shows the booking, requested package and current quotation or accepted agreement. Messages cannot change agreed prices, scope or booking status; existing quotation controls remain the way to agree commercial changes.
- Verified, active participants may send while the booking is `pending` or `accepted`. Both participant accounts must remain active for a new send. Listing re-review alone does not prevent existing participants from coordinating.
- Completed, rejected and cancelled bookings retain read-only conversation history. Active unverified legacy participants may read their own history and update their own read marker, but cannot send. Administrators have no messaging access through these endpoints.
- A conversation is created lazily when explicitly initialized or on the first new message, with at most one record per booking. Opening empty history does not create data. Existing bookings require no conversation backfill.
- History loads the latest 50 messages and supports earlier pages. New persisted messages are recovered after connection changes, focus and every 15 seconds while visible. Dashboard counts refresh every 30 seconds and after local message/read actions.
- Messages use plain text, UTC timestamps, sent/read labels, bounded scroll regions and mobile layouts. Incoming messages scroll automatically when the reader is already near the bottom; otherwise a jump control appears. Reading requires a visible, focused page at the recent-message boundary.

## Persistence and concurrency

Every new send uses one transaction to validate live participant accounts, lock the existing vendor guard, write a private booking guard, advance the conversation sequence, insert the message, increment the recipient's unread count and enqueue eligible notification intent. Broadcasts occur only after commit. A notification write failure rolls back the send.

The booking guard is necessary because existing cancellation/rejection/completion paths do not all take the vendor guard. Incrementing the booking document's private `messagingGuardRevision` with `timestamps:false` makes sends contend with every status update without changing booking business timestamps, schemas for commercial terms or transition permissions. If closure wins, the new send fails; a message that wins commits before closure. Receipts remain allowed after closure.

Messages have stable server ObjectIds, increasing per-conversation sequences and a required client-generated `clientMessageId`. The same sender/conversation/key with the same normalized text returns the original message with HTTP 200; changed text returns 409. New messages return 201. Replay precedes terminal-state eligibility checks, while current account and sender verification checks still apply. A customer and vendor may use the same key independently.

The frontend freezes an ambiguous attempt's key/text and retries that exact intent. Unconfirmed text is kept only in the browser tab's `sessionStorage`, scoped to user and booking, until confirmation. Logout, session expiry and account changes clear unrelated intents. Disabled browser storage reduces retry recovery to the mounted page's lifetime. Stored server history survives refresh, tab closure, disconnect and process restart.

Socket hints never advance the REST recovery cursor or read watermark. A later hint arriving before a missing earlier message therefore cannot skip persisted history or acknowledge unseen gaps. REST pages advance only a contiguous recovery sequence. Read positions move monotonically, cannot exceed the committed sequence and recalculate unread incoming messages transactionally against simultaneous sends.

## Security and privacy

- REST and Socket.IO share the existing HS256 access-token validation, HttpOnly cookie precedence, active-account checks, credential versions and legacy password-change compatibility. No new authentication cookie, token store or token-bearing URL is introduced.
- Cookie-based sockets require an exact allowed `Origin`; WebSocket upgrade requests are checked as well as polling. Cookie-free bearer/header or `auth.token` API clients remain supported. Production sockets require TLS, trusting forwarded protocol only through the configured Express proxy policy.
- Each socket event and each outbound recipient are reauthenticated and authorized against the live booking association. Session expiry disconnects immediately; periodic checks also disconnect revoked sessions. Sockets do not reuse an authorization-skipping recovery cache.
- Only the booking customer and current vendor owner can access a conversation. Supplied sender identities, extra fields, foreign booking IDs and arbitrary events cannot choose recipients or impersonate another participant. Participant drift in a stored conversation returns a conflict for operator review.
- Message text is limited to 4,000 characters and 16,000 UTF-8 bytes; whitespace-only text and invalid types are rejected. Control/bidirectional characters are removed. Responses use explicit field lists, omit account contacts/internal sender metadata, and React displays text without interpreting HTML.
- Message and notification bodies are excluded from application logs. Email payloads contain no message text, sender contact, location or quotation details. Authorization errors do not include message content.
- Read receipts reflect a participant-reported cursor, not proof of human attention. Transport encryption and application authorization are provided; MongoDB stores message text as plaintext under its existing access/backup controls. This is not end-to-end encryption.
- Existing logout revokes the presented refresh session and clears browser cookies. A copied access JWT retains its existing validity until expiry unless a credential-version/account change revokes it. Sockets enforce that same compatibility policy; this release adds no per-session access-token blacklist.

## Rate and resource limits

| Scope | Limit |
| --- | --- |
| Messaging HTTP per IP | Default 3,000 requests per 15 minutes; `MESSAGING_HTTP_RATE_LIMIT_MAX` |
| Sends per authenticated user | 30/minute, shared by REST and sockets |
| History/counts/receipts per authenticated user | 120/minute |
| Join/leave/init per authenticated user | 30/minute |
| Typing per authenticated user | 20/10 seconds |
| Socket attempts per authenticated user | 60/minute; at most 10 concurrent connections |
| Initial transport handshakes per client IP | 120/minute using Express's trusted-proxy address policy |
| Socket payload / queue | 32 KiB; at most 20 pending inbound and 50 pending outbound events per connection |
| Pagination | 1–50 messages; one `before` or `after` sequence cursor |
| Unread query | At most 100 booking IDs per request; frontend batches larger dashboards |

Excess realtime hints can be dropped when a connection's queue is full; REST still recovers committed messages. Typing expires after five seconds and is never buffered for later delivery. Limits are bounded in-memory stores, per API process, and reset on restart. Other API routes retain their existing HTTP/authentication limits. Shared multi-instance limits need a separately configured gateway/store.

## REST API

All paths are under `/api`; all require an authenticated customer/vendor participant. Responses retain `{ success, ...resource }`, and private reads disable caching.

| Method | Path | Purpose / response |
| --- | --- | --- |
| GET | `/bookings/:bookingId/conversation` | `{ conversation, booking }`; virtual empty conversation if not initialized |
| POST | `/bookings/:bookingId/conversation` | Verified participant initializes an eligible conversation; idempotent `{ conversation, booking }` |
| GET | `/bookings/:bookingId/messages?before=42&limit=50` | Earlier page, chronological `{ messages, conversation, pagination }` |
| GET | `/bookings/:bookingId/messages?after=42&limit=50` | Durable reconnect/catch-up page, chronological |
| POST | `/bookings/:bookingId/messages` | `{ clientMessageId, body }`; returns `{ message, conversation }`, 201 or 200 replay |
| PATCH | `/bookings/:bookingId/conversation/read` | `{ throughSequence }`; returns own updated `{ conversation }` |
| GET | `/conversations/unread?bookingIds=id1,id2` | `{ unreadCounts: { bookingId: count }, totalUnread }`; foreign requested IDs are rejected |

Without booking IDs, unread results contain up to 100 latest owned conversations and the total for the owned scope. The dashboard supplies explicit IDs and batches to obtain exact displayed-booking counts. A pagination response includes `hasMore`, `nextBefore` and `nextAfter`. `before` and `after` are mutually exclusive bounded integer sequences, not client timestamps.

## Socket.IO interface

The same Node HTTP server hosts Socket.IO at `/socket.io`, using the API origin derived from the existing `VITE_API_URL`. Browser clients use `withCredentials:true`; the existing REST refresh interceptor renews expired cookies before a new connection.

Inbound events acknowledge `{ success:true, ...result }` or `{ success:false, status, message }`:

| Event | Input |
| --- | --- |
| `conversation:join` | `{ bookingId }`; one active booking subscription per socket |
| `conversation:leave` | `{ bookingId }` |
| `message:send` | `{ bookingId, clientMessageId, body }`; same durable command as REST |
| `conversation:read` | `{ bookingId, throughSequence }`; same receipt command as REST |
| `conversation:typing` | `{ bookingId, isTyping }`; requires send eligibility and subscription |

Outbound events:

| Event | Payload |
| --- | --- |
| `message:new` | `{ bookingId, message }` after commit |
| `conversation:read` | `{ bookingId, readerRole, readThroughSequence, readAt }` |
| `conversation:typing` | `{ bookingId, role, isTyping, expiresAt }` |
| `conversation:presence` | `{ bookingId, online, peerRole }` |
| `session:invalid` | Safe authentication status before forced disconnect |

The UI submits persistent commands through REST and uses sockets for hints/typing. Presence means **connected here in this conversation on this API process**, not a global or guaranteed instantaneous online/offline assertion. Disconnects clear typing/presence indicators. No attachment, edit, deletion, direct-user chat or admin message API is exposed.

Socket.IO's default delivery does not guarantee that disconnected clients receive missed events. Planzo therefore recovers from its own persisted sequence rather than treating a connection as delivery proof. See the official [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) and [middleware behavior](https://socket.io/docs/v4/middlewares/).

## Durable new-message alerts

New messages reuse `NotificationOutbox` and the existing separate booking-email worker. The additional `message_received` event contains a conversation reference and recipient role; it never snapshots message text. The first eligible alert is delayed 90 seconds, with at most one new alert per conversation/recipient every 15 minutes. Subsequent rapid messages are covered by the generic unread alert.

Only verified active recipient mailboxes are eligible. Persisted legacy `notificationPreferences.bookingUpdates:false` is honoured, but no retired preference UI is restored. Before SMTP, the worker rechecks unread count, current participation, mailbox address/verification, account status and that preference. Read, unavailable or rerouted alerts become terminal `skipped` jobs instead of being sent or retried. Diagnostics include skipped counts; existing booking email behavior is unchanged.

There is no automatic reminder for an unchanged unread backlog after the first alert. A later new message outside the cooldown can enqueue a new alert. Reads racing SMTP can still result in an unnecessary generic email, and SMTP acceptance before durable acknowledgement can still produce a duplicate, as documented for the existing worker. Message persistence is independent of temporary socket or SMTP disconnections.

## Database changes and retention

Git history revealed an older chat implementation using `conversations` and `messages`. Those retired collections may still contain data and are deliberately not reused, migrated, deleted or exposed.

| Model / collection | Fields and indexes |
| --- | --- |
| Conversation / `bookingconversations` | Booking, vendor and two participant references; sequence/read/unread counters; read/alert/message timestamps; private transaction guard. Unique `bookingId` (`one_conversation_per_booking`), `{ customerId:1, lastMessageAt:-1 }`, `{ vendorUserId:1, lastMessageAt:-1 }` |
| Message / `bookingmessages` | Booking/conversation, internal sender, sender role, sequence, client retry ID, body, creation time. Unique `{ conversationId:1, sequence:1 }` (`one_message_per_conversation_sequence`), unique `{ conversationId:1, senderId:1, clientMessageId:1 }` (`one_message_per_sender_retry_key`) |
| Booking / `bookings` | Optional private `messagingGuardRevision`; no backfill, commercial schema change or reservation-index change |
| NotificationOutbox | Additive `message_received` event, `skipped` state, optional payload conversation reference; existing unique event/recipient and queue/lease indexes unchanged |

Five new secondary indexes are created and verified before API listening and inspected by the existing read-only preflight. Existing bookings need no rewrite; missing guards default to zero. No new User schema or notification-preference fields are added.

Messages/conversations are retained indefinitely with booking history. There is no TTL, end-user deletion endpoint or automatic purge. Application message APIs and normal model mutations are append-only; privileged database operations remain outside that guarantee. Any future retention/export/deletion procedure must be separately reviewed across messages, conversations, bookings, notification metadata and backups. This release performs none.

## Deployment and staging checklist

1. Back up and rehearse restoration separately. Use a transaction-capable MongoDB replica set and an isolated staging database. Read-only `data:audit` / `db:preflight` must pass after additive index initialization; missing new indexes before the first approved build are expected. Do not alter retired chat collections.
2. Deploy matching API, frontend and email-worker versions. Drain old workers before enabling new message alerts; older renderers do not support `message_received`/`skipped`. Keep traffic held while startup creates/verifies indexes, then rerun preflight. No destructive migration is provided or needed.
3. Use one persistent Node API process for the initial rollout. Socket fan-out/presence are process-local; multi-node realtime needs a shared adapter and polling affinity, neither introduced here. Persisted history and periodic REST catch-up remain the fallback, but they do not make cross-node presence accurate.
4. Forward `/api` and `/socket.io` to that API, including HTTP polling and WebSocket upgrades. Keep proxy idle timeout above Socket.IO's heartbeat interval plus timeout (defaults total 45 seconds). Follow the official [reverse-proxy guide](https://socket.io/docs/v4/reverse-proxy/). A serverless frontend host alone cannot run the persistent socket server.
5. Set exact `CLIENT_URL` origins, production HTTPS and verified `TRUST_PROXY` hops. Preserve existing Secure/HttpOnly cookie settings; test actual browser cross-site-cookie restrictions on deployment domains. Set optional `MESSAGING_HTTP_RATE_LIMIT_MAX` (default 3000, integer 1–100000 per IP per 15 minutes). No new secret or frontend environment variable is required.
6. Build with the actual HTTPS `VITE_API_URL`; the socket endpoint uses that URL's origin and `/socket.io`. A path-prefix deployment must route that socket path explicitly. Confirm readiness, graceful socket shutdown, worker supervision and SMTP delivery configuration.
7. Test two independent customer/vendor sessions: pending and accepted sends, timestamps, quoting summary, unread badges, visible read receipts, typing expiry and disconnect presence. Confirm unrelated customers/vendors and admins cannot join/read/send, and suspended/revoked sessions stop receiving.
8. Race first conversation creation, identical retries, send/read updates and message submission against booking closure. Confirm one conversation, one persisted retry result, increasing sequences, accurate incoming unread counts and read-only terminal history.
9. Disconnect transport while sending, lose a response, reload, and retry the same saved intent. Reconnect after several messages and force an out-of-order hint; verify every persisted message is recovered with no duplicate or skipped sequence. Test background tabs, older-page scrolling, expired cookies, logout and account switching.
10. Verify delayed/batched generic emails against a sandbox SMTP sink. Read before dispatch, change mailbox/proof/status/preference and confirm suppression. Exercise SMTP failure/retry and process interruption without re-opening bookings or re-submitting messages.
11. Run real mobile/desktop browser checks, hosted proxy/cookie checks, MongoDB failover, backup restoration and operational load limits. These hosted integrations were not exercised by local automated tests. Rate limits and presence remain process-local; plan shared infrastructure before scaling API replicas.

## Verification record

Local verification includes isolated MongoDB transaction tests, actual Socket.IO test clients, frontend component/connection tests and existing booking/authentication/quotation regressions.

| Check | Result |
| --- | --- |
| Full backend suite | 291 passed, 0 failed; includes 20 messaging, 13 actual Socket.IO, 7 alert and 2 HTTP-policy cases |
| Full frontend suite | 266 passed across 39 files, 0 failed |
| Operational tests | 5 passed |
| Backend syntax | 110 JavaScript files passed |
| Production frontend build | Passed with explicit placeholder HTTPS API URL |
| Dependency audits | API and frontend both report 0 vulnerabilities |
| Isolated Chrome layouts | 9 passed: customer/vendor pending and customer completed-history at 320, 390 and 1440px; 9 interaction checks, 0 page errors/unexpected requests |
| Credential/history scan and Git whitespace checks | Passed |

The initial frontend run exposed a missing router wrapper in existing card tests and an initial-scroll/read timing issue; these were corrected and the complete suite rerun. Regression tests also cover the reviewed out-of-order reconnect gap, malformed legacy peer fields and preservation of pending retries during network/5xx session checks. Local MongoDB tests emitted connection-reset diagnostics, but their runners exited 0 with all tests passing. Browser layout checks deliberately use isolated REST fixtures and unavailable socket transport; actual socket behavior is exercised by separate integration tests, not claimed as a hosted browser test.

No hosted deployment, production-data audit, real SMTP delivery, backup restoration or failover was performed. The repository has no configured ESLint command.

Community research provided one additional reconnect example: [Yadnyesh Rana's durable-ID/deduplication discussion](https://dev.to/yadnyesh_rana/why-your-real-time-chat-app-duplicates-messages-on-reconnect-and-the-fix-4ij1). This supports the persistence/recovery approach, rather than establishing production verification; the implementation also follows the primary Socket.IO documentation linked above.

## Changed files

New backend files:

- `server/src/models/Conversation.js`, `Message.js`
- `server/src/services/messagingService.js`, `messagingViewService.js`, `messagingEvents.js`, `messageNotificationService.js`, `sessionAuthenticationService.js`
- `server/src/controllers/messagingController.js`, `server/src/routes/messagingRoutes.js`, `server/src/utils/messagingRateLimit.js`, `server/src/realtime/messagingSocket.js`
- `server/test/messaging.test.js`, `messagingSocket.test.js`, `messageNotifications.test.js`, `messagingHttpPolicy.test.js`

Modified backend files:

- `server/server.js`, `server/src/app.js`: HTTP/socket lifecycle, route mounting and dedicated messaging IP budget.
- `server/src/middleware/authMiddleware.js`: shared existing authentication checks.
- `server/src/models/Booking.js`, `NotificationOutbox.js`: private send guard and additive alert metadata/state.
- `server/src/services/bookingEmailService.js`, `server/src/workers/bookingEmailDispatcher.js`: generic message alerts and dispatch-time suppression.
- `server/src/utils/databasePreflight.js`, `outboxDiagnostics.js`, `logger.js`; `server/test/databasePreflight.test.js`, `outboxDiagnostics.test.js`: new indexes, skipped diagnostics and safe counters.
- `server/src/config/environment.js`, `server/.env.example`: messaging HTTP rate configuration.
- `server/package.json`, `server/package-lock.json`: Socket.IO runtime and test-client dependencies.

New frontend files:

- `frontend/src/pages/BookingConversationPage.jsx`, `BookingConversationPage.test.jsx`
- `frontend/src/components/ConversationBookingSummary.jsx`, `BookingMessagingActions.test.jsx`
- `frontend/src/hooks/useUnreadMessages.js`, `useUnreadMessages.test.jsx`
- `frontend/src/services/messagingService.js`, `conversationConnection.js`, `conversationConnection.test.js`
- `frontend/src/utils/messageIntent.js`, `messages.js`, `messages.test.js`

Modified frontend files:

- `frontend/src/components/BookingCard.jsx`, `BookingCard.test.jsx`; `frontend/src/pages/CustomerDashboardPage.jsx`, `VendorDashboardPage.jsx`: actions, counts and router-aware tests.
- `frontend/src/context/AuthContext.jsx`, `AuthContext.test.jsx`: scoped pending-intent cleanup on confirmed session/account changes, preserving retries on temporary network failures.
- `frontend/src/routes/AppRoutes.jsx`, `frontend/src/utils/navigation.js`, `navigation.test.js`: protected messaging route and safe login destination.
- `frontend/package.json`, `frontend/package-lock.json`: Socket.IO client dependency.
- `frontend/scripts/verify-ui.mjs`: isolated messaging layout fixtures and scenarios.

Documentation: root `README.md`, `server/README.md`, `docs/OPERATIONS.md` and this report. No files were deleted/moved; no commits or pushes were made. Dependencies added are Socket.IO 4.x on the API and `socket.io-client` 4.x on the frontend and for server integration tests.
