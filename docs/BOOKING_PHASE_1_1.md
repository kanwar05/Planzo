# Booking reliability — Phase 1.1

## Initial audit (before implementation)

Inspected the actual Booking, Vendor, User and Availability models; booking, availability and admin controllers/routes; authentication and error middleware; vendor visibility helpers; startup/index creation; server/root READMEs; migration guide; data audit; and backend marketplace, auth, security, startup and audit tests. The baseline targeted suite passed all 9 tests.

### Existing safeguards

- Cookie/Bearer authentication checks the live account, credential version and suspension; role middleware guards creation and scoped lists. Status operations verify the associated customer or vendor owner. Admins intentionally manage any booking.
- The server enforces pending → accepted/rejected/cancelled and accepted → completed/cancelled. Terminal states cannot reopen. Customers only cancel; vendors accept/reject/complete. Both admin routes share these same transitions, with no terminal-state override.
- Status-conditioned writes prevent stale transitions. Repeated actions return 409 before changing the record. No notifications, payments or other external side effects exist in this flow.
- A real partial unique index on vendorId + eventDateOnly for accepted/completed already prevents concurrent double acceptance when stored day keys are canonical. Startup waits for index creation.
- Creation/acceptance check UTC calendar days, approval and availability. Pending requests reserve nothing. Accepted cancellation releases a date; completed bookings retain it. availableDates is informational, not an allowlist.
- Booking serialization allowlists fields and never supplies private account email/phone. Only intentionally shared business contacts are revealed to authorized viewers.

### Missing protections and races

- Acceptance and availability blocking each read the other collection before writing. Both may succeed concurrently, leaving a booked day explicitly unavailable. A database transaction with a common vendor write is needed; snapshot reads alone would still permit write skew.
- The existing data audit misses invalid BSON dates and nonempty malformed/mismatched day keys. An index on an incorrect key does not guarantee actual calendar-day exclusivity. Startup does not currently gate this prerequisite.
- Acceptance trusts a present legacy eventDateOnly rather than detecting disagreement with eventDate.
- The vendor-active helper excludes deactivated users but, unlike authentication, permits legacy blocked/suspended accountStatus values without suspendedAt.

### Test gaps

Existing tests already cover real-index concurrent acceptance, basic ownership/transitions, cancellation release, completed-date retention, privacy and legacy missing-key reads. Missing coverage includes exhaustive role/transition rules and both admin routes, sequential/concurrent repeats and first-reason preservation, competing updates to one booking, accept versus date blocking, cookie booking authentication, installed index inspection, dirty-date startup refusal and robust read-only migration reports.

## Scope and preserved rules

Only Phase 1.1 is in scope. Keep the existing API shape and 409 response for repeated status requests; do not silently turn repeats into successful mutations. Keep UTC date boundaries, same-day bookings, informational availableDates, contact privacy and the admin transition exceptions described above. No frontend or authentication architecture changes are planned.

## Changes and bugs fixed

- Acceptance and availability save/reset now run in short MongoDB transactions that first increment an internal Vendor.bookingRevision. This common write prevents both operations from committing after mutually stale availability reads. Snapshot transactions without the common write would not be sufficient. The driver retries transient transaction conflicts; callbacks have no HTTP responses or external side effects. All operations use the same session and commits use majority write concern.
- Concurrent partial availability saves re-read omitted fields on retry, preventing one save from losing the other field. The guard also serializes initial availability upserts and reset operations. Pending booking creation remains an advisory availability check: requests do not reserve a day, and acceptance always checks availability again.
- Status writes still condition on the original status, and now also on the booking's customer/vendor IDs. Vendor acceptance rechecks the vendor actor's ownership inside the transaction. A stale acceptance aborts the whole transaction, including the counter write. Single-document reject/cancel/complete operations retain their conditional writes.
- Acceptance/completion derive the actual UTC day from eventDate and refuse inconsistent nonempty stored day keys with 409 rather than silently moving a reservation. Missing legacy keys can still be read, and reservation transitions canonicalize them. Production startup requires all legacy keys to be repaired first.
- Vendor eligibility now excludes legacy blocked/suspended owners consistently with authentication, as well as deactivated owners and suspendedAt records. Public discovery and booking eligibility use the same restriction.
- The read-only date audit now reports missing, invalid and mismatched keys, invalid BSON date types/ranges, and actual-day duplicate reservations even when stored keys disagree. Examples contain booking IDs and issue flags, with no customer descriptions or contact details.
- Startup refuses standalone MongoDB, MongoDB versions below 6, unsafe date data, or failed index creation. Automatic indexing during connection is disabled so the read-only preflight precedes explicit index creation. The original partial unique booking index is retained unchanged; it is independently tested against competing raw database writes.

The existing transition graph was already correct and was retained. Tests now lock down all 100 combinations of source/target state and customer/vendor/admin actors, including both admin routes. Same-status repeats still return 409 without touching the first reason or updatedAt. Admins may manage any customer's booking, accept/reject/cancel pending bookings and complete/cancel accepted bookings; they have no terminal-state override or availability/approval bypass. Vendors still cannot cancel. No new timing restriction was added to completion or eligible cancellation.

## Files changed

| File | Purpose |
| --- | --- |
| [server/src/controllers/bookingController.js](../server/src/controllers/bookingController.js) | Atomic acceptance, canonical reservation dates, stronger conditional writes |
| [server/src/controllers/availabilityController.js](../server/src/controllers/availabilityController.js) | Transactional save/reset and retry-safe partial updates |
| [server/src/utils/vendorBookingTransaction.js](../server/src/utils/vendorBookingTransaction.js) (new) | Shared database transaction guard |
| [server/src/models/Vendor.js](../server/src/models/Vendor.js) | Hidden internal counter, no new index/backfill |
| [server/src/utils/availability.js](../server/src/utils/availability.js) | Session-aware booking/availability queries |
| [server/src/services/vendorSearchService.js](../server/src/services/vendorSearchService.js) | Session-aware eligibility and consistent legacy inactive-owner restriction |
| [server/src/utils/bookingDataAudit.js](../server/src/utils/bookingDataAudit.js) (new) | Robust read-only date audit and startup preflight |
| [server/scripts/auditData.js](../server/scripts/auditData.js) | Extended operator report, retains existing fields |
| [server/src/config/database.js](../server/src/config/database.js) | Transaction topology/version checks and explicit indexing |
| [server/server.js](../server/server.js) | Run date preflight before index creation/listening |
| [server/test/bookingReliability.test.js](../server/test/bookingReliability.test.js) (new) | Role/transition matrix, ownership, cookie lifecycle, repeats, conflicts and dates |
| [server/test/mvpMarketplace.test.js](../server/test/mvpMarketplace.test.js) | Replica fixture, real index, availability race, partial-save and rollback coverage |
| [server/test/dataAudit.test.js](../server/test/dataAudit.test.js) | Corrupt/legacy date audit and read-only guarantees |
| [server/test/startup.test.js](../server/test/startup.test.js) | Replica success and unsafe topology/data refusal |
| [server/.env.example](../server/.env.example) | Replica-set URI example |
| [server/README.md](../server/README.md) | Preserved API rules, repeat semantics and transaction prerequisite |
| [README.md](../README.md) | Setup/deployment prerequisites |
| [docs/MVP_MIGRATION.md](MVP_MIGRATION.md) | Reviewed rollout and index migration procedure |
| [docs/BOOKING_PHASE_1_1.md](BOOKING_PHASE_1_1.md) (new) | Initial audit and final report |

No dependencies, frontend files, authentication architecture or Booking index definitions changed. No existing tests were deleted.

## Validation

Commands run from server/, against isolated MongoMemoryServer/MongoMemoryReplSet fixtures only:

| Check | Result |
| --- | --- |
| Baseline `npm.cmd test -- test/mvpMarketplace.test.js test/dataAudit.test.js` | 9 passed |
| Targeted `npm.cmd test -- test/mvpMarketplace.test.js test/bookingReliability.test.js test/dataAudit.test.js` | 26 passed |
| `npm.cmd test -- test/startup.test.js` | 4 passed |
| Final startup/audit check `npm.cmd test -- test/dataAudit.test.js test/startup.test.js` | 7 passed, including lightweight preflight and duplicate-index refusal |
| Complete backend regression `npm.cmd test` (final code) | **71 passed, 0 failed, 0 skipped**, approximately 69.3 seconds |
| `npm.cmd run check` | 46 JavaScript files passed syntax checks |
| `git diff --check` | Passed |

Added 20 top-level tests in total, including the 100-case transition matrix. Tests cover concurrent accepts through the API and the database's installed index, accept versus date blocking, transaction rollback when cancellation wins, concurrent partial availability saves, cancellation release/reset behavior, completed-date retention, every role's transitions, ownership and privacy, sequential/concurrent repeats, cookie login/refresh/logout, leap/invalid/past dates, eligibility changes, malformed/mismatched legacy data and startup refusal without data changes.

MongoMemoryServer's replica shutdown printed intermittent ECONNRESET diagnostics on Windows; test assertions and process exit codes passed. These messages came from the test fixture's shutdown command. No frontend tests were needed because no frontend behavior/contracts were changed.

## Production requirements and remaining risks

Follow [Booking reliability Phase 1.1](MVP_MIGRATION.md#booking-reliability-phase-11) before deploying. Use MongoDB 6+ with transactions, pause all old booking/availability writers, back up, run the read-only audit, repair reviewed legacy dates/keys and resolve real collisions, verify the existing partial unique index, then start the new API instances before resuming mutations. Startup intentionally fails closed until these prerequisites hold. There is no automatic business-data repair and no production migration was executed.

- The deployed application's actual data and indexes were not inspected or modified. Existing booked/unavailable overlaps need operator review; the transaction prevents new overlaps but does not rewrite old decisions. Direct database writers must maintain canonical date keys and use the same transaction discipline for booking/availability mutations.
- Replica failover, network partitions and production load were not simulated. Unknown commit outcomes can still require clients to refresh the booking; retrying a successful status change is safe and returns the existing 409. Per-vendor transactions serialize reservation/availability changes, so high-contention vendor traffic should be measured.
- Startup date preflight scans booking history with bounded result counts/samples; it skips duplicate grouping and relies on index creation to enforce uniqueness. The operator-run full audit still groups duplicate details. Measure audit/startup time on a large staging copy. Existing customer/vendor booking lists remain unpaginated.
- The separate account-deactivation guard still checks active bookings before changing the account. A concurrent new pending submission can race that guard; this broader account-lifecycle race was not changed in this booking-status phase. Authentication still checks account state at the start of each request; in-flight requests are not retroactively revoked.
- UTC date boundaries remain the documented API rule. The frontend's local-calendar minimum date can differ near midnight; selecting a different business timezone would require an explicit product decision.
- Existing legacy slot indexes/rules and orphaned references remain subject to the earlier migration guide. No cleanup, deletion, payments, messages or additional phase work was performed.

## Sources and Community Wisdom

MongoDB documents [single-document conditional atomicity and multi-document transactions](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/), [partial unique constraints](https://www.mongodb.com/docs/manual/core/index-partial/), and [replica-set transaction requirements](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/). The per-vendor write guard is the application-specific way this change forces otherwise independent booking/availability writes to contend.

### 🌐 Community Wisdom: [Lock-Free Wait-on-Conflict and Fail-on-Conflict in MongoDB](https://dev.to/mongodb/lock-free-wait-on-conflict-and-fail-on-conflict-in-mongodb-372h)
> **Source**: [Franck Pachot](https://dev.to/franckpachot), writing for MongoDB
> **Tags**: `mongodb`, `database`, `transaction`, `consistency`
>
> The author demonstrates that explicit transactions can fail on write conflicts and require retry handling; short callbacks must avoid irreversible external effects. His [Sequences in MongoDB](https://dev.to/mongodb/sequences-in-mongodb-with-gap-and-no-gap-transactional-57e4) demonstration also shows the shared transactional increment rolling back with the transaction. Both posts had zero comments when inspected, so they provide a concrete author demonstration, not evidence of broad community consensus. The DevRelay gateway was unavailable in this session; the public articles and official database documentation were read directly.
>
> 🔗 [Read Full Discussion](https://dev.to/mongodb/lock-free-wait-on-conflict-and-fail-on-conflict-in-mongodb-372h)

A DEV draft about this solve or a shared session transcript can be prepared separately if requested; neither was created or published.

Phase 1.1 ends here.
