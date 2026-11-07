# Vendor onboarding and marketplace - Phase 1.3

## Initial audit

Read README.md, server/README.md, BOOKING_PHASE_1_1.md, BOOKING_PHASE_1_2.md and MVP_MIGRATION.md. Inspected Vendor/User models, vendor/admin/booking/account controllers, routes, authentication, upload middleware, availability/transaction helpers, public search, existing frontend pages/services and tests.

Existing features to reuse: owner-scoped profile creation/editing; pending/approved/rejected listing statuses; rejection feedback and resubmission; protected admin approval and account suspension; public approved/active filtering and response allowlists; services/category/city/price search; stable public sorting; profile/cover/portfolio routes; decoded image uploads with server-generated asset IDs, MIME/extension and 5MB/eight-photo limits; responsive vendor dashboard, portfolio tools, availability and booking actions. The architecture does not support partial drafts, so required creation fields remain required.

Missing protections: approved public content can change without re-review; moderation has no inspected revision/CAS or audit history; suspension writes span multiple independent updates; combined image saves can lose concurrent updates/exceed the photo cap; old assets are deleted before a successful database detach; coercible search parameters and all-active-user ID expansion weaken discovery; no city/coverage fields, completion/private preview, or profile/cover UI. Public badges incorrectly imply identity verification. Account deactivation/profile deletion can race booking creation and orphan a new request.

## Chosen policy before implementation

Keep pending/approved/rejected and current booking rules. Essential review fields are the established business name, category, description, service location and nonnegative starting price. City/coverage, services, images and intentionally shared contacts are supported but not new approval prerequisites for legacy profiles. No government documents or identity checks.

Material edits to business name/category/description/location/city/coverage/services or any public images return an approved listing to pending. Price, protected contact details and date availability are operational edits and retain approval. Rejected vendors resubmit through a valid profile save, as before. Owners/admins receive an internal profile revision; stale updates/decisions return409, and the new admin UI sends the inspected revision. Legacy clients may omit it and receive request-time CAS protection.

## Profile and approval lifecycle

| State/action | Result |
| --- | --- |
| Complete vendor creates their profile | Pending manual listing review |
| Vendor tries to set owner/approval/suspension/image IDs in JSON | Protected fields ignored; no permission escalation |
| Admin approves a complete active listing | Approved, with a moderation record |
| Admin rejects a listing | Rejected; reason returned only to owner/admin |
| Rejected vendor saves corrected valid fields | Pending again; old rejection feedback is cleared |
| Approved vendor changes material public text, coverage, services or media | Pending again and hidden from new discovery/requests |
| Approved vendor changes price, protected contacts or availability | Approval retained |
| Equivalent normalized content is saved | Approval retained |
| Staff suspends an account | Account/listing hidden together and credentials revoked |
| Staff removes suspension | Existing approval state retained; deactivated accounts are not reactivated |

This is manual marketplace listing approval, not identity verification or a service-quality guarantee. The existing verificationStatus and verified API fields and /verify route remain for compatibility. Public badges now say Approved listing. No government IDs or sensitive verification documents are requested or stored by this phase.

The five established core fields remain the submission/approval requirements. Description must be nonempty and within the existing maximum; pricing must be finite and nonnegative, including zero. Existing business-name/category/location limits remain. Optional city is at most 100 characters; serviceAreas and servicesOffered contain at most 20 trimmed, unique nonempty strings of at most 120 characters each. Existing JPEG/PNG/WebP, 5MB-per-file and eight-portfolio-photo limits remain. Contacts are explicitly shared business contacts, never a fallback to private User email/phone. City defaults to the location's first comma-separated component for legacy display/search; no backfill is required.

The existing admin ability to decide another valid review state is preserved, including deliberately approving a corrected complete rejected profile. Same-state decisions return unchanged success without duplicate audit/revocation effects. Incomplete, suspended or inactive profiles cannot be approved. The new admin UI sends the inspected profileRevision; an actual stale decision returns409. Legacy clients may omit that new parameter and receive compare-and-set protection against changes during the request, but cannot prove what a human inspected earlier.

## Concurrency, privacy and booking compatibility

- Every owner text/image mutation compares and increments profileRevision. Approval, rejection, suspension and restoration increment that same revision. A stale write returns409 instead of overwriting another edit or publishing unreviewed content. Missing legacy revisions behave as zero. Owner/admin responses expose the revision and essential-field completion; public responses omit both.
- The editor keeps its business-form revision separate from media state. An image response cannot lend a stale business form a newer revision to overwrite another tab's changes. Local unsaved edits are preserved; a conflict requires reload/reconciliation.
- Admin decisions and their minimal audit records commit in one transaction. Suspension atomically updates User, Vendor, authVersion/refresh revocation and audit. Audit rows contain actor/target/vendor IDs, action, prior/new state, reason, revision and created time, without full profiles, contacts, credentials or customer booking data.
- Account and vendor guards serialize new booking creation against account deactivation/profile deletion. Guards lock the account before the vendor. Internal User.bookingGuardRevision is separate from authVersion, so normal bookings do not log users out. Creation rechecks eligibility and dates inside the transaction that also stores the Phase 1.2 email intent.
- A winning new booking prevents deactivation/deletion from orphaning it. A winning deactivation/deletion makes creation fail with403/404 and creates no booking/email job. Accounts with pending/accepted bookings still cannot deactivate; profiles with any booking history still cannot be deleted. Completed history, reserved dates and existing outbox records are preserved.
- Material re-review does not change existing booking statuses or reservations. Authorized existing accepted bookings can still complete/cancel under Phase 1.1 rules; new requests/acceptance wait for renewed listing approval. Suspension retains its existing account-access restriction, so admins manage affected booking history.
- Image mutations use owner-scoped revision updates, including the combined upload path. The losing concurrent upload is cleaned up without deleting a saved image. Database detachment happens before provider deletion. New or replaced provider assets are identified only from server-held owned references; user-provided URLs/IDs cannot delete another vendor's asset.
- Discovery joins each candidate to an eligible owner instead of materializing every active User ID in application memory. Search escapes text, validates categories and scalar numeric values, rejects fractional/invalid pagination, and keeps stable creation-time/ID sorting. Explicit city and legacy location fallback share the same public filtering rules.
- Aggregation bypasses Mongoose casting, so public serialization validates types as well as keys. Malformed legacy objects nested in names, arrays, image fields, IDs or dates cannot expose private/internal values. Protected contacts, owner accounts, rejection/suspension notes, revisions and authentication fields remain excluded.
- Active means accountStatus active or compatible legacy missing/null status, with no suspendedAt and a vendor role. Unknown/deleted/blocked/suspended/deactivated states cannot bypass discovery, approval, authentication or new-booking eligibility. Cookie/JWT/refresh/OTP/password-recovery architecture remains intact.

Cloudinary cannot join MongoDB transactions. Cleanup happens after successful detach/commit and is best effort: an outage can leave unreferenced assets for operator cleanup, but cannot delete an image still referenced by a losing/stale write. Profile deletion checks provider configuration before deleting a profile that owns images, then commits database deletion before cleanup. A cleanup failure logs a fixed message while the successful database deletion remains successful; this is an intentional correction to the old delete-provider-before-database behavior.

## Vendor and admin screens

Existing React/Tailwind pages were extended, not replaced. Vendor setup has optional city/coverage, essential completion, private saved/unsaved preview, profile/cover upload/removal and existing portfolio management. It shows approval/rejection feedback, clear resubmission actions, optional availability navigation, busy/validation feedback and stale-save reload handling. The dashboard adds completion/status and correction/public-listing actions. Only public fields/photos appear in the private preview; it does not request a pending profile through the public endpoint.

The existing admin approval screen now has pending/approved/rejected/all filters, escaped basic business/service/city/coverage search, suspension filtering, profile/media/contact inspection, revision-bound approve/reject actions, reason entry, suspension/restoration confirmation and paginated moderation history. Approve is disabled for incomplete/inactive/suspended profiles. UI rejection and suspension require helpful reasons; the backend retains its legacy optional rejection-reason contract. History is admin-only at GET /api/admin/vendors/:vendorId/audit.

Public cards/detail pages keep their responsive layouts and show accurate city/coverage information with manual-approval wording. Public profiles never expose shared business contacts; accepted/completed customers still obtain them through authorized booking responses as before.

## Environment, indexes and rollout

No new dependencies, secrets, authentication scheme, booking statuses, reservation/outbox index changes, email event types or external services were added. Existing MongoDB 6+ replica-set requirements, SMTP worker operation and Cloudinary configuration remain. Account deactivation and moderation tests now use replica-set fixtures because those operations require atomic multi-document writes.

Additive schema changes: optional city/serviceAreas, internal Vendor.profileRevision and User.bookingGuardRevision, and a new vendormoderationaudits collection. Counters initialize on normal writes and do not require a historical-data backfill. Existing manual approved/verified records remain readable. No historical audit records are fabricated and no existing vendor's business status is automatically migrated. Unknown non-active account states are deliberately denied for eligibility.

Startup waits for the existing indexes plus:

```javascript
// Review these definitions before production rollout; not executed against production.
db.vendors.createIndex(
  { verificationStatus: 1, createdAt: -1, _id: -1 },
  { name: "vendor_review_queue_order" }
)
db.vendormoderationaudits.createIndex({ vendorId: 1, createdAt: -1, _id: -1 })
```

The existing unique vendor-owner index and category/price discovery index are retained. The added vendor index supports the status-filtered moderation queue's stable ordering; the audit index supports per-vendor history. Revision comparisons already use the unique _id lookup and need no separate revision index. Do not run syncIndexes, drop indexes/collections, or reset revisions during deployment.

Back up, test on staging, inspect existing indexes, then deploy API/frontend together. Pause or coordinate old mutation writers during cutover: older profile/media/account implementations do not participate in the new revision/guard protocol. Keep the existing Phase 1.2 worker running independently. API startup creates/waits for additive indexes; no production data migration, provider operation or deployment was run during this work.

## Files changed

| Area | Files |
| --- | --- |
| Vendor schema, validation and eligibility | [Vendor.js](../server/src/models/Vendor.js), [vendorProfileService.js](../server/src/services/vendorProfileService.js) (new), [vendorSearchService.js](../server/src/services/vendorSearchService.js), [accountEligibility.js](../server/src/utils/accountEligibility.js) (new) |
| Owner operations and lifecycle | [vendorController.js](../server/src/controllers/vendorController.js), [bookingController.js](../server/src/controllers/bookingController.js), [authController.js](../server/src/controllers/authController.js), [authMiddleware.js](../server/src/middleware/authMiddleware.js), [User.js](../server/src/models/User.js), [vendorBookingTransaction.js](../server/src/utils/vendorBookingTransaction.js) |
| Moderation | [adminController.js](../server/src/controllers/adminController.js), [adminRoutes.js](../server/src/routes/adminRoutes.js), [VendorModerationAudit.js](../server/src/models/VendorModerationAudit.js) (new), [server.js](../server/server.js) |
| Backend tests | [vendorOnboarding.test.js](../server/test/vendorOnboarding.test.js) and [vendorModeration.test.js](../server/test/vendorModeration.test.js) (new), [mvpMarketplace.test.js](../server/test/mvpMarketplace.test.js), [mvpAuth.test.js](../server/test/mvpAuth.test.js) |
| Vendor experience | [VendorProfilePage.jsx](../frontend/src/pages/VendorProfilePage.jsx), [VendorDashboardPage.jsx](../frontend/src/pages/VendorDashboardPage.jsx), [uploadService.js](../frontend/src/services/uploadService.js), [vendor.js](../frontend/src/utils/vendor.js) |
| Public experience | [VendorCard.jsx](../frontend/src/components/VendorCard.jsx), [VendorDetailsPage.jsx](../frontend/src/pages/VendorDetailsPage.jsx) |
| Admin experience | [AdminVerifyVendorsPage.jsx](../frontend/src/pages/AdminVerifyVendorsPage.jsx), [adminService.js](../frontend/src/services/adminService.js) |
| Frontend tests | [VendorProfilePage.test.jsx](../frontend/src/pages/VendorProfilePage.test.jsx), [VendorDashboardPage.test.jsx](../frontend/src/pages/VendorDashboardPage.test.jsx), [VendorCard.test.jsx](../frontend/src/components/VendorCard.test.jsx), [VendorDetailsPage.test.jsx](../frontend/src/pages/VendorDetailsPage.test.jsx), [AdminVerifyVendorsPage.test.jsx](../frontend/src/pages/AdminVerifyVendorsPage.test.jsx), [uploadService.test.js](../frontend/src/services/uploadService.test.js) (new) |
| Documentation | [README.md](../README.md), [server/README.md](../server/README.md), [MVP_MIGRATION.md](MVP_MIGRATION.md), this new report |

There are 36 changed/new files. Existing tests were preserved; booking status/index definitions and the email dispatcher/sender were not changed.

## Automated validation

| Check | Result |
| --- | --- |
| Existing booking/auth/email targeted regression | 39 passed |
| Vendor onboarding/security/race tests | 14 passed |
| Admin moderation tests | 11 passed |
| Complete backend `cd server; npm.cmd test` (final code) | **135 passed, 0 failed, 0 skipped**, approximately 124.5 seconds |
| Backend `npm.cmd run check` | 59 JavaScript files passed syntax checks |
| Complete frontend `cd frontend; npm.cmd test -- --maxWorkers=2` | **118 passed across 21 files**, approximately 19.5 seconds |
| Frontend `npm.cmd run build` (final code) | Passed; 2,140 modules, approximately 6 seconds |
| `git diff --check` | Passed |

The 25 new backend tests cover required/optional onboarding validation, ownership and protected fields, incomplete approval, rejection/resubmission, minor/material edits, stale and concurrent profile/image/approval updates, moderation rollback/audit privacy, session-safe suspension, inactive/legacy accounts, scalar search/paging and stable ties, malformed nested legacy privacy, live-route image authorization and cap cleanup, booking/outbox compatibility, and deactivation/profile-deletion races. Existing Phase 1.1/1.2 tests all pass. Frontend tests exercise completion, onboarding/preview/privacy, approval wording, photos, review/suspension/history controls, conflicts and upload API contracts.

Tests use isolated databases and fake Cloudinary/SMTP providers; no real provider upload, email or production database operation was performed. MongoMemoryServer prints known ECONNRESET shutdown diagnostics on Windows; assertions and process exit codes pass. Frontend esbuild initially hit a sandbox ancestor-directory access denial; the required test rerun outside that restriction succeeded. The app has no separate lint script; the configured syntax checks, frontend tests and production build are the relevant checks.

## Manual end-to-end checks for staging

1. Create customer and vendor accounts; provision an admin using the existing admin:create command. Use only staging MongoDB, SMTP and Cloudinary configuration. Confirm no identity-document fields or verification claims are presented.
2. Open vendor setup on desktop and a narrow mobile viewport. Enter the five required details, zero/nonzero starting price, city, coverage and services/packages. Confirm completion, inline errors and the private preview. Preview must omit shared contacts. Save and confirm pending state/public404.
3. Upload/replace/remove profile and cover photos. Upload a portfolio up to eight photos, then try a ninth, unsupported type, oversize file and another vendor's deletion target. Confirm validation, loading feedback and preserved valid photos.
4. As admin, search/filter the pending queue, inspect text/media/coverage/shared contacts and approve the loaded revision. Confirm an audit entry, public discovery/detail visibility and the Approved listing explanation. Test category, city, service-name and price filters/pagination; inspect public JSON for contact/internal fields.
5. Reject another submission with a useful reason. As its owner, confirm feedback, correct it, save/resubmit, and approve again. Repeat the same admin decision and confirm no duplicate audit. Try an incomplete legacy profile and confirm approval is blocked.
6. Open an owner editor and admin review in separate tabs. Change material text or a photo, then approve from the stale admin tab: expect409 and refresh before re-deciding. Try two opposing admin decisions; one revision wins. Test stale owner saves and a photo response arriving after another tab edited business details; the old form must not overwrite newer data.
7. On an approved listing, update price/contacts/availability: approval stays. Change description, services, coverage or photos: pending/public hidden. Confirm a preexisting accepted booking remains reserved and can complete; customer shared contacts still obey booking status. Booking email jobs remain intact.
8. Suspend/restore from the admin page and inspect history. A suspended vendor disappears and cannot authenticate/accept. Restoration retains review state. A deactivated account cannot be restored/approved by suspension controls. Customers/vendors cannot access moderation or another owner's profile/image mutations.
9. With active bookings, account deactivation/profile deletion should return409. On staging, run a booking submission concurrently with eligible deactivation/deletion: either creation wins and blocks the destructive operation, or the latter wins and creation fails; no orphan booking/email intent. Historical completed records remain.
10. Check keyboard focus/dialog dismissal, loading/retry states, mobile wrapping, long names/areas and error messages. Review real Cloudinary cleanup failures and production-size query plans separately; those remote/manual checks were not performed by the automated suite.

## Remaining production risks

- Existing malformed or incomplete legacy approvals are not automatically repaired/re-reviewed. Typed public serialization suppresses nested malformed data, and new moderation decisions enforce essential fields; operators should inspect historical anomalies on staging before rollout.
- Legacy clients omitting profileRevision get request-time concurrency safety, not proof of an earlier human inspection. Deploy the new frontend with the API and require third-party moderation clients to send their inspected revision.
- Cross-service Cloudinary cleanup is best effort and can leave unreferenced assets after an outage. There is no new cleanup scheduler; investigate fixed cleanup logs and reconcile only owned, detached IDs. Existing image references and provider assets are never broadly deleted.
- Audit history begins with this release and is append-only through the application, not cryptographically tamper-proof against database administrators. Define retention/access controls. Deleted profiles retain underlying audit records; the history endpoint requires an existing profile.
- Contains-search and legacy city fallback can still scan candidates. The owner lookup removes the all-user-ID expansion, but production-volume index/query plans and load/failover were not benchmarked.
- Live account checks authorize at request start; unrelated in-flight requests are not retroactively cancelled. The booking/deactivation/deletion paths now share guards specifically to prevent new orphan requests. External/direct database writers must follow the same revision/transaction rules.
- Existing SMTP duplicate-delivery limits and UTC/local-calendar boundary behavior from earlier phases remain. No real provider end-to-end or pixel-level browser smoke pass was performed; use the staging checklist above.

## Sources and Community Wisdom

MongoDB documents [expected-value conditional atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/) and [common writes for transactional stale-read protection](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/). Mongoose's [findOneAndUpdate guide](https://mongoosejs.com/docs/8.x/docs/tutorials/findoneandupdate.html) supports the atomic update approach. Planzo uses explicit integer revisions and existing driver transaction retries rather than changing authentication or introducing locks/queues outside MongoDB.

### 🌐 Community Wisdom: [Implementing Concurrency Control in MongoDB](https://dev.to/sheep_/implementing-concurrency-control-in-mongodb-1ban)
> **Source**: [sheep](https://dev.to/sheep_)
> **Tags**: `mongodb`, `javascript`, `programming`, `beginners`
>
> The author's Mongoose example combines a conditional update with a transaction when the change and a log must succeed together. Its timestamp approach is illustrative; Planzo uses an integer revision to avoid same-millisecond collisions. This post and [Jérôme TAMARELLE's versioned-document example](https://dev.to/gromnan/mongodb-optimistic-update-with-versioned-documents-3e4b) both support rejecting stale writes, but neither had comments when inspected, so they are implementation examples rather than evidence of community consensus. The DevRelay gateway was unavailable; public articles and primary database documentation were read directly.
>
> 🔗 [Read Full Discussion](https://dev.to/sheep_/implementing-concurrency-control-in-mongodb-1ban)

A DEV draft/session export can be prepared separately if requested; neither was created or published. Phase 1.3 only; no later phase was started.
