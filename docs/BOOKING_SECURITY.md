# Booking lifecycle and marketplace security

This change builds on the completed cleanup at `ca65ed1`, preserving the MERN
architecture, cookie names, JWT/refresh authentication, booking transition graph,
reservation index, transactional outbox and separate email worker. The starting
working tree was clean. No commit, push or live data operation is part of the work.

## Issues and resulting behavior

| Issue | Result |
| --- | --- |
| Accepted future bookings could be completed immediately | Backend and frontend require the full UTC event day to have elapsed; backend checks again inside the mutation transaction. |
| Registration/password login did not prove mailbox ownership | An authenticated verification page uses the existing OTP infrastructure. Customer booking creation and vendor marketplace writes require persisted ownership proof. |
| Raw populated vendor/customer fallbacks could expose legacy fields | Booking output always uses typed identifiers, a customer name/ID projection and the explicit vendor allowlist, including incomplete legacy records. |
| Frontend today/formatting used the browser timezone while backend used UTC | Date inputs, comparisons, display, availability and lifecycle eligibility now follow one UTC calendar-day policy. |
| Retried booking submissions could create repeated requests and notifications | An optional customer-scoped idempotency key is persisted atomically with the booking and outbox intent; the frontend reuses its key for unresolved retries. |
| Registration discarded the selected booking destination | Router state carries a validated application pathname through login, registration and verification. |
| Backend reason fields were not collected in the UI | Customer cancellation, vendor rejection and admin cancellation use the existing dialog pattern to collect optional reasons; backend validation and authorization remain authoritative. |

## Booking date policy

`eventDateOnly` is a real `YYYY-MM-DD` **UTC calendar day**, independent of server,
browser or user timezone. `eventDate` remains its UTC-midnight Date representation;
neither field is converted to a local wall-clock day. There is no event start or
finish time in the current schema.

- Creation accepts today or a future UTC day. An unchanged keyed retry can replay
  its already-committed request even after that day passes.
- Acceptance rechecks the current UTC date, vendor eligibility, availability and
  existing reservations inside the transaction.
- Completion requires `accepted` and `eventDateOnly < utcToday()`. For an event
  on `2028-02-29`, `2028-02-29T23:59:59.999Z` is too early and
  `2028-03-01T00:00:00.000Z` is eligible. Admins follow the same rule.
- Cancellation/rejection retain existing permissions and transitions without a
  new date restriction. Final states remain final; repeated transitions return409.
- Availability uses the same literal day keys and existing vendor write guard.
  Resetting availability does not release an accepted/completed reservation.
- Frontend today/minimum dates and display use UTC. The browser clock provides
  UI guidance; the server clock determines authorization. Keep API hosts synced.

This deliberately retains the backend's historical day keys. Switching to a
different marketplace timezone would require a separately reviewed data and
product policy; existing reservations are not reinterpreted here.

## Email ownership and compatibility

`User.emailVerifiedAt` is a nullable persisted timestamp. Missing/null/invalid
legacy proof is unverified. Password login, registration or refresh must not
invent proof. Existing accounts remain able to log in, rotate refresh tokens,
recover/change passwords, manage their account, read their own booking history
and cancel their own eligible bookings. Admin permissions remain unchanged.

Verified ownership is required before a customer creates a new booking request,
and before vendors create/edit/delete profiles, upload/delete images, change
availability or accept/reject/complete requests. Gates run before uploads and
mutations; booking creation rechecks the locked account's proof in its transaction.
An unverified request returns403 with fixed code `EMAIL_VERIFICATION_REQUIRED`.
Existing vendor listings are not automatically deleted or hidden.

New authenticated endpoints:

| Method/path | Contract |
| --- | --- |
| `POST /api/auth/email-verification/request` | Sends to the server-held current account email. Client-supplied addresses cannot redirect delivery. |
| `POST /api/auth/email-verification/verify` | Body `{ "code": "123456" }`; consumes a valid challenge and returns updated `user.emailVerified`. Does not replace the current session. |

Initial proof and existing email OTP login share one account-keyed challenge,
cooldown, expiry, atomic five-attempt budget and single-use consumption; issuing
another code invalidates the old challenge. Only HMAC hashes are stored. Existing
OTP login also establishes ownership. The existing email-change link proves the
new address atomically with address replacement and credential revocation.

New OTP challenges bind to the issuer's credential version. A code issued before
a password reset/change or another credential-version change cannot establish ownership or
start a new session afterward. Legacy challenges without a version remain usable
only for unchanged version-zero accounts; others must request a fresh code. Proof
updates also compare current email, account state and version to fence changes
during verification. Delivery failure removes only its own issued challenge.
Existing request/confirmation limiters cover both OTP entry points.
Ordinary logout revokes its presented refresh session without invalidating an
independently issued mailbox code.
Invalid code responses carry fixed code `OTP_VERIFICATION_FAILED`; the browser
does not refresh/replay them and spend a second OTP attempt. An actual expired
access session still uses the existing refresh interceptor. Booking replay after
refresh retains its original idempotency header.

The frontend uses `/verify-account-email`; `/verify-email` remains the separate
existing account email-change link route. Return paths are accepted only from a
known application pathname allowlist; external/protocol-relative URLs, encoded
paths, backslashes, whitespace and arbitrary destinations are rejected.

## Booking retries and privacy

Clients may supply `Idempotency-Key` using a UUID or 16–128 characters from
`[A-Za-z0-9._:-]`. Scope is the authenticated customer. The normalized vendor,
event day/type/location, description and notes determine payload identity.

- First committed request: 201 and a new booking.
- Same customer/key/payload: 200 and the same booking, with no extra notification
  event, including after acceptance, cancellation or the original event date.
- Same customer/key/different payload: 409, including simultaneous submissions.
- Different customers may use the same key independently.
- Failed booking/outbox transactions do not consume the key.
- No key: existing clients keep independent pending-request behavior. The server
  does not mistake two deliberately different requests for a retry.

The form blocks parallel local submissions and keeps the original payload/key
while a timeout, lost response or server failure leaves the outcome uncertain.
Edits remain locked until that attempt is resolved; retry can recover the original
booking even across UTC midnight. A definite validation rejection permits a
corrected request. Opening a new form starts a new intent. Its key is not persisted
across full browser reloads; clients that need reload recovery must preserve their
operation key. Metadata has no TTL and stays with booking retention. CORS and
proxies must allow/forward `Idempotency-Key`.

`idempotencyKeyHash` and `requestHash` are private, excluded from normal queries
and booking response serialization. The raw key is never persisted. Booking
responses expose only customer ID/name and allowlisted vendor fields. Private
account emails/phones/passwords do not become business sharing contacts. Only
the associated accepted/completed customer, owning vendor and admin may receive
explicitly provided sharing contacts; incomplete records never bypass that rule.

Optional cancellation/rejection reasons are bounded plain text. The backend
rejects wrong types/oversized input, trims whitespace, normalizes CRLF and removes
unsafe control/bidirectional formatting characters. React renders reason text
with normal escaping. Reasons are serialized only for the customer, vendor owner
or administrator; history endpoints still enforce row ownership.

## Database and rollout

The following additive schema changes are necessary to persist security/retry
state across sessions, processes and restarts:

| Model | Addition | Existing documents |
| --- | --- | --- |
| User | Nullable `emailVerifiedAt` | Missing/null means unverified; no automatic verification backfill. |
| EmailOtp | Optional credential `authVersion` | New issues bind to the issuer; legacy missing version requires unchanged version-zero account. No new OTP index. |
| Booking | Optional hidden `idempotencyKeyHash` and `requestHash` | Legacy unkeyed bookings remain readable and do not participate in the new unique constraint. |
| Booking index | Unique `(customerId, idempotencyKeyHash)` named `one_booking_per_customer_idempotency_key`, partial on string key hash | Independent of `one_confirmed_booking_per_vendor_date`; no reservation-index replacement. |

There is no bulk migration, schema rewrite, new collection, automatic legacy
approval or live database operation. Startup explicitly creates and verifies
declared indexes before serving traffic; read-only preflight discovers the new
index from the schema. An old deployment will report that index missing until its
approved additive build. Rehearse on a restored staging copy before rollout.

Deploy the API enforcing proof/idempotency together with the new frontend;
communicate the verification requirement to existing customers/vendors. Ensure
SMTP delivery and a separate OTP HMAC secret are configured. Pause or drain older
API writers at cutover because they do not enforce these gates or honor retry
keys. Review index-build privileges/capacity and deployment rollback compatibility.
Do not mark old accounts verified merely to avoid the rollout requirement.
Follow [operations](OPERATIONS.md) for backups, preflight and the separate worker.

## Files and verification

All requested local verification completed on Windows with Node `v24.21.0` and
npm `12.1.0`. The project still selects Node 22 in `.nvmrc`/CI; that runtime was
not separately run locally. Dependency manifests and lockfiles were not changed.

| Check | Final result |
| --- | --- |
| Full backend suite | 222 passed; zero failures/skips. |
| Full frontend suite | 201 passed across 29 test files; zero failures. |
| Operational suite | 5 passed. |
| Backend syntax | 80 JavaScript files passed. |
| Production frontend build | Passed with placeholder `VITE_API_URL=https://staging-api.example.invalid/api`; did not contact a hosted API. |
| Dependency security audit | Both frontend and backend report zero known vulnerabilities. No dependencies added or upgraded. |
| Repository/history secret scan | 205 text files scanned, zero findings under the existing rule set. |
| Git diff checks | Passed; no deleted files, schema removals, dependency churn or unrelated edits. |

The initial full frontend run found ten category-test failures: its registration
fixture did not exercise new verification, leaving queued profile mock results
for subsequent tests. Those tests now complete mailbox verification while
checking all five service categories and onboarding draft preservation; mock
queues are reset between cases. No working category functionality was removed.
Backend and frontend suites were rerun after the final OTP-refresh fix.

Frontend test/build startup initially hit the Windows sandbox's esbuild
parent-directory restriction and passed after approved escalated execution.
Backend MongoMemoryServer teardown still emits the existing `ECONNRESET`
diagnostics in successful test runs; all tests finish with exit0. Manual Chrome
QA scripts were updated to use explicitly verified fixtures and syntax-checked,
but were not executed. No lint configuration exists, so no lint result is claimed.

### New files

```text
docs/BOOKING_SECURITY.md
frontend/src/components/BookingReasonDialog.jsx
frontend/src/pages/AuthFlowNavigation.test.jsx
frontend/src/pages/VerifyAccountEmailPage.jsx
frontend/src/pages/VerifyAccountEmailPage.test.jsx
frontend/src/services/api.test.js
frontend/src/services/bookingService.test.js
frontend/src/utils/format.test.js
frontend/src/utils/navigation.test.js
server/src/utils/bookingDates.js
server/src/utils/emailVerification.js
server/test/bookingDates.test.js
server/test/bookingLifecycle.test.js
server/test/bookingView.test.js
server/test/emailVerification.test.js
server/test/helpers/bookingClock.js
server/test/marketplaceEmailVerification.test.js
```

### Modified files

```text
README.md
docs/OPERATIONS.md
frontend/scripts/measure-ui.mjs
frontend/scripts/verify-ui.mjs
frontend/src/components/BookingCard.jsx
frontend/src/components/BookingCard.test.jsx
frontend/src/components/ProtectedRoute.jsx
frontend/src/components/ProtectedRoute.test.jsx
frontend/src/layouts/DashboardLayout.jsx
frontend/src/pages/AdminBookingsPage.jsx
frontend/src/pages/AdminBookingsPage.test.jsx
frontend/src/pages/AuthPages.test.jsx
frontend/src/pages/BookingRequestPage.jsx
frontend/src/pages/BookingRequestPage.test.jsx
frontend/src/pages/CustomerDashboardPage.jsx
frontend/src/pages/CustomerDashboardPage.test.jsx
frontend/src/pages/LoginPage.jsx
frontend/src/pages/RegisterPage.jsx
frontend/src/pages/ServiceCategories.test.jsx
frontend/src/pages/VendorAvailabilityPage.jsx
frontend/src/pages/VendorDashboardPage.jsx
frontend/src/pages/VendorDashboardPage.test.jsx
frontend/src/routes/AppRoutes.jsx
frontend/src/services/api.js
frontend/src/services/authService.js
frontend/src/services/bookingService.js
frontend/src/utils/format.js
frontend/src/utils/navigation.js
server/README.md
server/src/app.js
server/src/controllers/authController.js
server/src/controllers/bookingController.js
server/src/middleware/authMiddleware.js
server/src/middleware/errorMiddleware.js
server/src/models/Booking.js
server/src/models/EmailOtp.js
server/src/models/User.js
server/src/routes/authRoutes.js
server/src/routes/bookingRoutes.js
server/src/routes/vendorRoutes.js
server/src/services/bookingViewService.js
server/src/services/vendorSearchService.js
server/src/utils/availability.js
server/test/bookingNotifications.test.js
server/test/bookingReliability.test.js
server/test/mvpMarketplace.test.js
server/test/security.test.js
server/test/vendorModeration.test.js
server/test/vendorOnboarding.test.js
```

Existing concurrency tests retain their reservation/status assertions; fixtures
explicitly establish proof, and the completion clock helper advances Date beyond
the event without changing the stored reservation to bypass the new policy.
New tests cover UTC midnight/leap-day boundaries, malformed dates/records,
premature completion on vendor and admin APIs, concurrent terminal transitions,
key scope/reuse/conflict/rollback/unique-index enforcement, OTP attempts/replay/
credential races/SMTP cleanup, gate placement before uploads, safe return paths,
verification navigation, escaped reasons and immutable uncertain form retries.

## Security rationale and remaining hosted evidence

Return destination validation follows the principle of accepting known local
destinations rather than trusting user-supplied URLs; see the
[OWASP redirect guidance](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html).
Reason handling uses bounded plain text plus output escaping rather than treating
HTML as trusted input; see [OWASP input validation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).

Local tests use isolated MongoDB, captured OTP delivery and provider fixtures.
Hosted MongoDB/SMTP/Cloudinary, inbox delivery, browser/proxy/cross-site cookies,
multi-instance load, clock synchronization, backup restoration and failover still
require staging evidence. Existing SMTP acceptance-before-acknowledgement duplicate
delivery limits, per-process rate stores and provider orphan cleanup remain.
