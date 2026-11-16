# Vendor packages and quotations

This release adds structured service packages, optional package selection, vendor quotations and customer-approved commercial agreements to the existing marketplace. It retains Express/Mongoose transactions, the single-date booking model, verified-email gates, booking retries and the durable booking-email worker. It adds no runtime dependencies, payment processing or other marketplace features.

## Workflow and compatibility

1. A vendor with verified email and an existing profile creates, edits or deactivates packages at `/vendor/packages`. Pending profiles may prepare packages; only active packages matching an approved, eligible vendor's current category appear publicly.
2. A customer selects a public package or keeps the existing custom request option. Login, registration and email verification preserve a validated package ID alongside the existing safe booking destination. The server rechecks ownership, activity and category while holding the same vendor guard used for bookings and package edits.
3. Package selection copies the package's current revision and descriptive commercial fields into the booking. Subsequent package edits or deactivation cannot rewrite this requested-package snapshot. Package prices and add-ons are guides, not accepted obligations or automatically calculated invoice items.
4. A vendor sends a quotation for a pending booking. Each revision stores its own itemized prices, charges, discount, total, service day, deliverables, exclusions, terms and expiry. Earlier revisions remain available in history.
5. Only the booking's verified customer can accept its latest offered, unexpired revision. One transaction saves the accepted snapshot, changes `pending` to `accepted`, reserves the existing vendor/date slot and enqueues the existing `booking_accepted` email intent. No reservation exists merely because a quote was sent.
6. Rejecting a quotation leaves the booking `pending`, marks the latest offer rejected and permits another vendor revision or an existing booking cancellation/rejection. It does not reject the booking itself.
7. After acceptance, the existing `accepted -> completed/cancelled` rules apply. Completion still requires the entire UTC event day to have ended. The agreement remains visible in authorized booking history after completion or cancellation.

An existing custom booking with no selected package and no quotation history retains direct vendor/admin acceptance. A package-selected booking or any booking with quotation history must use explicit customer quotation acceptance; vendor and admin status endpoints return 409 if asked to bypass it. No existing accepted booking acquires a fabricated agreement.

An agreement is immutable through application APIs. There is no agreement-edit endpoint, revisions are append-only through the Quotation model, and conditional transaction updates permit the snapshot only on first acceptance. This is not a database-level guarantee against privileged database writes or native driver maintenance operations; restrict those credentials and review operational changes.

## Dates, amounts and limits

- `eventDateOnly` and quotation `serviceDate` use the same real `YYYY-MM-DD` UTC calendar day. A quote must match the booking's day; it cannot reschedule it. Pricing units such as day/hour and descriptive maximum duration do not create multi-day reservations.
- Expiry is a real UTC timestamp ending in `Z`, including seconds. New offers must expire in the future and within 365 days. The editor accepts local wall time and converts it to a UTC instant; review displays UTC. Acceptance checks expiry in application code and at the conditional database write with the database clock. Synchronize API/database clocks.
- Amounts are integer INR paise, never floating-point rupees. Backend calculations ignore supplied totals and calculate `subtotalAmount = sum(quantity * unitPriceAmount)` and `totalAmount = subtotalAmount + charges - discountAmount`.
- Individual amounts and gross totals are bounded to 100,000,000,000 paise. Quantities are whole numbers from 1 to 1,000,000. Negative amounts, fractional paise, unsafe totals, unsupported currency and discounts exceeding gross charges are rejected. The frontend uses decimal-string/BigInt conversion when converting rupee input.
- Packages allow up to 30 included services, 30 exclusions and 20 add-ons. A vendor may retain at most 100 packages, including inactive ones; reuse or reactivate existing records instead of deleting history. A package's category must match its current vendor profile before it is publicly selectable.
- Quotes allow 1–50 service items, up to 20 additional charges, 30 deliverables and 30 exclusions. A booking supports at most 100 retained revisions. History returns all supported revisions, newest first. Short fields, descriptions and terms have bounded text lengths; control/bidirectional characters are removed, and React renders plain text.

## API additions

All paths below are under `/api`. Authentication, role checks, email verification and cookie-origin protection use the existing middleware. Package/quotation writes also recheck the live actor account and credential version within the transaction. Private booking/quotation reads retain no-store caching policy. Serializers explicitly allowlist output and omit retry hashes, private contacts and creator metadata.

| Method | Path | Access and result |
| --- | --- | --- |
| GET | `/vendors/:vendorId/packages` | Public, eligible approved vendor; `{ packages }` containing current active packages |
| GET | `/vendors/packages/mine` | Owning vendor; all retained packages, including inactive |
| POST | `/vendors/packages` | Verified vendor; creates owned package, returns `{ package }` with 201, or 200 on keyed replay |
| PATCH | `/vendors/packages/:packageId` | Verified owner; supported fields plus inspected `revision`; stale revision returns 409 |
| DELETE | `/vendors/packages/:packageId` | Verified owner; JSON `{ revision }`; soft deactivation, never physical deletion |
| GET | `/bookings/:bookingId/quotations` | Associated customer, vendor owner or admin; `{ quotations }`, descending revision |
| POST | `/bookings/:bookingId/quotations` | Verified vendor owner; pending booking; required retry key and `expectedRevision`; `{ quotation, booking }` |
| POST | `/bookings/:bookingId/quotations/:revision/accept` | Verified booking customer; explicit acceptance; `{ booking }` |
| POST | `/bookings/:bookingId/quotations/:revision/reject` | Verified booking customer; reject latest offer; `{ booking }` |

Existing `POST /bookings` additionally accepts optional `packageId`. Omit it for a custom request; malformed, foreign or unavailable selections cannot create a booking. Existing custom-booking retry hashes remain compatible. Authorized booking responses optionally include `selectedPackage` and `acceptedAgreement`, and include quotation revision/status metadata.

Minimal package creation body (all price fields are paise):

```json
{
  "title": "Garden styling",
  "description": "Seasonal floral decoration and setup",
  "serviceCategory": "Decoration",
  "priceAmount": 1200050,
  "priceType": "starting",
  "pricingUnit": "event",
  "includedServices": ["Floral styling", "Stage setup"],
  "exclusions": ["Venue rental"],
  "addOns": [{ "title": "Extra hour", "priceAmount": 150000, "pricingUnit": "hour" }],
  "maxDurationMinutes": 240,
  "maxQuantity": null,
  "active": true
}
```

Example quotation body; replace the example dates with the booking's day and an eligible future expiry:

```json
{
  "expectedRevision": 0,
  "serviceDescription": "Garden wedding decoration",
  "items": [{ "description": "Floral setup", "quantity": 2, "unitPriceAmount": 600000 }],
  "additionalCharges": [{ "description": "Transport", "amount": 50000 }],
  "discountAmount": 10000,
  "serviceDate": "2099-04-01",
  "deliverables": ["Stage backdrop and floral installation"],
  "exclusions": ["Venue rental"],
  "terms": "Access to the venue is required for setup.",
  "expiresAt": "2099-03-01T00:00:00.000Z"
}
```

The server copies selected-package identity/title from the booking rather than trusting client attribution. A new offer needs the current `expectedRevision` (zero initially); it increments the revision by one and resets the offer state to `offered`.

## Retries and concurrency

- Quote creation requires `Idempotency-Key`; package creation accepts it optionally, and the UI supplies it. Keys use the existing 16–128 safe ASCII character format. Package keys are scoped to the vendor, quote keys to the booking. Only hashes are stored.
- A repeated key with the same normalized payload returns 200 without another creation/revision. Reusing it for changed content returns 409. Quote replay returns the original revision plus the current booking even if a later revision or acceptance exists. Package replay returns the existing package's current state.
- Booking retries retain the existing customer-scoped contract. Selected package identity participates in its hash; keyed replay returns the original booking even if the package was later changed or deactivated.
- During ambiguous network/server failures, package/quotation forms freeze the original payload and key for retry. They prevent ordinary editor-close/refresh controls from discarding that attempt. Keys are held for the mounted form's lifetime; a full reload/new form is a new attempt. Review existing history after an interruption before creating a new offer/request.
- Repeated acceptance of the same accepted revision returns 200, preserves the original snapshot/timestamp and enqueues no additional email, even after completion/cancellation. Reject replay is also harmless. A stale or competing revision/decision returns 409.
- Existing account/vendor transaction guards serialize package edits, quote revisions, direct acceptance, suspension and availability changes. Booking compare-and-set conditions and the unchanged unique accepted/completed vendor/date index remain authoritative. Concurrent customer acceptances for two bookings on one date cannot both reserve it.

Sending/revising/rejecting a quotation adds no email event. Customers find offers in their existing booking dashboard. Acceptance reuses the durable booking acceptance notification and separate worker; no new notification infrastructure or SMTP guarantee is introduced.

## Database and rollout

Additive changes only:

| Collection/model | Change |
| --- | --- |
| `vendorpackages` / VendorPackage | New structured package records, revision, timestamps and hidden optional retry hashes |
| `quotations` / Quotation | New append-only revisions with content, participant references and hidden retry metadata; no TTL |
| `bookings` / Booking | Optional `selectedPackage` snapshot; `quotationRevision` default 0; `quotationStatus` default `none` (`none/offered/rejected/accepted`); optional `acceptedAgreement` snapshot |

Four new secondary indexes:

| Collection | Index definition | Purpose |
| --- | --- | --- |
| `vendorpackages` | `{ vendorId: 1, active: 1, createdAt: -1 }` | Owner/public package listings |
| `vendorpackages` | Unique `{ vendorId: 1, creationKeyHash: 1 }`, string-only partial filter; `one_package_per_vendor_creation_key` | Keyed package creation |
| `quotations` | Unique `{ bookingId: 1, revision: 1 }`; `one_quotation_revision_per_booking` | Audit revision ordering/uniqueness |
| `quotations` | Unique `{ bookingId: 1, requestKeyHash: 1 }`; `one_quotation_per_booking_request_key` | Idempotent offer creation |

Startup registers both models, creates their indexes and verifies installed definitions before listening. The read-only `db:preflight` also checks them. No migration/backfill is required for existing bookings; missing commercial fields retain legacy behavior. No legacy records, uploads, environments, secrets or Git history are removed. Retain package/quotation/snapshot data together under the existing backup and access policy.

Staging/release procedure:

1. Back up the database and verify restore separately. Use a replica set with transactions; run existing read-only `data:audit` and `db:preflight` checks against staging first. The new preflight initially reports missing indexes on an unupgraded database; do not treat that report as a completed migration.
2. Pause/drain old API writers before enabling the new workflow. Older API processes do not know that a quoted booking needs customer acceptance. Deploy a consistent API version; do not allow a rollback to old writers while commercial bookings remain pending without a separately reviewed compatibility procedure.
3. With traffic held, start the new API so additive model/index initialization completes, or apply the same reviewed index definitions through the database operator's normal procedure. Resolve any incompatible existing indexes explicitly; the code does not drop or rewrite them. Rerun `db:preflight` and require all checks to pass before traffic.
4. Deploy the matching frontend, built with the actual HTTPS API URL, and keep the existing email worker running. No new environment variables or services are required. Keep proxy forwarding of `Idempotency-Key` and existing allowed-origin/HTTPS settings.
5. Use separate customer/vendor/admin staging accounts. Confirm unverified writes are blocked, public package visibility follows approval/suspension/category, and foreign package/quotation IDs never disclose private content.
6. Create/edit/deactivate a package, select it through registration/verification, submit the request twice with the same key and confirm one booking. Change/deactivate the package and confirm the booked snapshot survives. Also exercise a custom request without a package.
7. Send/revise a quote, reject it, resend, test expiry and explicitly accept it. Race acceptance against a revision and against another booking for the same date. Confirm only a legal transition wins, one reservation remains and acceptance retries retain the exact first snapshot. Later package/profile edits, cancellation and valid completion must preserve that snapshot.
8. Check mobile/desktop review and editor flows in real browsers, especially local expiry input, integer rupee formatting and interrupted retries. Verify real cookie/refresh behavior, MongoDB failover and SMTP acceptance delivery/backlog using the existing operations probes. These hosted integrations were not tested by the local automated suite.

## Verification record

Local verification for this implementation:

| Check | Result |
| --- | --- |
| Backend full suite | 249 passed, 0 failed; isolated MongoMemoryServer replica sets |
| Frontend full suite | 233 passed across 34 files, 0 failed |
| Operational suite | 5 passed |
| Backend syntax checks | 95 JavaScript files passed |
| Production frontend build | Passed with an explicit placeholder HTTPS API URL; 2,154 modules transformed |
| Backend / frontend npm audit | Both report 0 vulnerabilities; no dependency/lockfile changes |
| Repository credential/history scan | Passed |
| Git diff whitespace check | Passed |

The initial frontend run exposed ambiguous amount lookup and helper text included in form labels; those were corrected and the entire suite rerun successfully. Backend output included a MongoDB connection-reset diagnostic; the runner exited 0 with every test passing. There is no configured ESLint command. No hosted deployment, real email delivery, production-data preflight, backup restoration or failover was performed.

New regressions cover package validation/ownership/caps/revisions/retries, inactive/foreign selection, package-edit and selection races, quote integer calculations and malformed amounts, revision history/retries/caps, expiry, customer/vendor permissions and verification, current credential-version fences, concurrent acceptance/revision/decisions, reservation conflicts, outbox rollback/replay and immutable snapshots. Frontend tests cover package management/selection, exact money parsing, safe authentication intent, quotation review/decisions/errors and frozen retries. Existing authentication/booking/worker regressions remain in the full suites.

## Changed-file inventory

New backend files:

- `server/src/models/VendorPackage.js`, `Quotation.js`, `packageSnapshotSchema.js`, `quotationSchemas.js`
- `server/src/controllers/packageController.js`, `quotationController.js`
- `server/src/routes/packageRoutes.js`, `quotationRoutes.js`
- `server/src/services/packageService.js`, `packageViewService.js`, `quotationService.js`, `quotationViewService.js`
- `server/test/packages.test.js`, `packageBookings.test.js`, `quotations.test.js`

Modified backend files:

- `server/src/models/Booking.js`: additive commercial fields.
- `server/src/controllers/bookingController.js`: selection snapshot, retry compatibility and quotation acceptance guard.
- `server/src/services/bookingViewService.js`: allowlisted participant-only commercial output.
- `server/src/app.js`, `server/server.js`: route mounting and startup index initialization.
- `server/src/utils/databasePreflight.js`, `server/test/databasePreflight.test.js`: new models/indexes and legacy-compatible offer status inspection.

New frontend files:

- `frontend/src/components/PackageDetails.jsx`, `VendorPackages.jsx`, `BookingPackageSelector.jsx`, `BookingQuotations.jsx`, `QuotationDetails.jsx`, `QuotationEditor.jsx`
- `frontend/src/pages/VendorPackagesPage.jsx`
- `frontend/src/services/packageService.js`, `quotationService.js`; `frontend/src/utils/money.js`
- `frontend/src/components/VendorPackages.test.jsx`, `BookingQuotations.test.jsx`
- `frontend/src/pages/VendorPackagesPage.test.jsx`, `BookingPackageSelection.test.jsx`; `frontend/src/utils/money.test.js`

Modified frontend files:

- `frontend/src/pages/VendorDetailsPage.jsx`, `BookingRequestPage.jsx`: public packages and optional request selection/review.
- `frontend/src/components/BookingCard.jsx`; `frontend/src/pages/CustomerDashboardPage.jsx`, `VendorDashboardPage.jsx`, `AdminBookingsPage.jsx`: quotations and accepted agreement review in existing bookings.
- `frontend/src/routes/AppRoutes.jsx`, `frontend/src/layouts/DashboardLayout.jsx`: vendor package page and navigation.
- `frontend/src/components/ProtectedRoute.jsx`; `frontend/src/pages/LoginPage.jsx`, `RegisterPage.jsx`, `VerifyAccountEmailPage.jsx`; `frontend/src/utils/navigation.js`: safe package intent through authentication.
- `frontend/src/pages/AuthFlowNavigation.test.jsx`, `BookingRequestPage.test.jsx`, `CustomerDashboardPage.test.jsx`, `VendorDetailsPage.test.jsx`; `frontend/src/utils/navigation.test.js`: navigation/regression fixtures and assertions.
- `frontend/scripts/verify-ui.mjs`, `measure-ui.mjs`: package GET fixtures for existing browser QA scripts.

Documentation: root `README.md`, `server/README.md`, `docs/OPERATIONS.md` and this implementation/rollout record.

No existing source files were deleted or moved. No packages were added/removed and no dependency manifests or lockfiles changed. Existing authentication tokens/flows, UTC day rules, cancellation reasons, profile moderation, contact privacy, reservation indexes and durable notification delivery remain in place. The intentional behavior change is customer-only acceptance once a package or quotation participates in a pending booking.

Remaining operational limits include per-process rate limiting, form-lifetime retry keys, the existing SMTP accepted-before-acknowledgement duplicate window, and immutability enforced by application access rather than privileged database controls. Full production readiness still requires the staging evidence above. Profile deletion without booking history may leave retained, hidden package records; no automatic destructive cleanup or retention job was added.
