# Planzo MVP migration guide

No migration has been executed against application data. Removing a Mongoose field or model does not erase stored MongoDB documents. The MVP preserves retired collections, payment records, verification documents, and Cloudinary assets.

## Booking reliability Phase 1.1

This is a rollout prerequisite, not an automatically applied data migration. No new booking index is introduced: the existing partial unique index remains the reservation constraint. The changes add a transaction guard for acceptance/availability and refuse traffic until stored booking dates are safe for that constraint.

1. Back up and test the procedure on a staging copy. Pause booking and availability mutations on **all** old API instances and external writers during the migration and cutover. Mixed old/new writers do not share the new transaction guard.
2. Use MongoDB 6+ with replica-set transactions (for example Atlas). A local single-node replica set is sufficient for development; use a redundant production deployment. An initialized local set named rs0 uses `MONGODB_URI=mongodb://127.0.0.1:27017/planzo?replicaSet=rs0`. Provision/initialize the replica set before starting the API; do not run `rs.initiate()` against an existing production deployment. Standalone instances now fail startup instead of exposing failing transaction endpoints. For sharded deployments, the bookings collection must support the existing unique vendor/date index; keep it unsharded unless the shard-key/index restrictions have been explicitly validated.
3. Run `npm run data:audit` first against staging, then the paused intended database. The report is read-only and exits nonzero for missing day keys, invalid eventDate BSON types/ranges, malformed day keys, mismatches between eventDateOnly and the UTC eventDate, or duplicate accepted/completed reservations on the actual UTC day. `bookingDateIssues` contains at most 20 ID-only examples; use the counts to determine whether further operator inspection is needed. Audit all booking states, including historical terminal records.
4. Review invalid dates and timezone history manually. For valid eventDate records, use the additive missing-key backfill below only after approval. Correct nonempty malformed/mismatched keys through an operator-reviewed migration. Do not blindly replace a historical date or change a customer's event day. Resolve actual vendor/day collisions with the affected people; never automatically cancel/delete/merge bookings. Also review any existing unavailableDates that overlap accepted/completed bookings: the new transaction prevents new overlaps but does not repair old ones.
5. Re-run the audit until all four date-issue counts are zero and `duplicateReservations` is empty. Keep old writers paused through startup. The API runs the read-only canonical-date preflight before explicit index creation and refuses to listen on unsafe data. Startup skips the audit's duplicate grouping to avoid growing aggregation memory on healthy booking history; the unique-index build immediately afterward refuses duplicate stored reservation keys before listening.
6. Inspect `db.bookings.getIndexes()`. The required index must have this definition (the existing startup `createIndexes()` adds it if absent):

   ```javascript
   db.bookings.createIndex(
     { vendorId: 1, eventDateOnly: 1 },
     {
       name: "one_confirmed_booking_per_vendor_date",
       unique: true,
       partialFilterExpression: { status: { $in: ["accepted", "completed"] } }
     }
   )
   ```

   This is an example for operator review, not a command executed by this work. If a conflicting definition/name exists, resolve it during the paused migration after backup; do not automatically drop or sync indexes. Startup fails on index errors. The index must cover accepted **and** completed states, not pending/rejected/cancelled.
7. Deploy all API instances with the new code, confirm successful startup and run a booking/availability smoke check, then resume traffic. `bookingRevision` is an internal Vendor counter used to make transactions contend; `$inc` initializes it on existing documents, so it needs no backfill or new index. It is omitted from API views. Application credentials need the same collection read/write privileges plus the ability to create the declared indexes at startup. No new secrets or dependencies are needed.

Transaction callbacks use the MongoDB driver's retry handling and majority commits, with no email or other external side effects. Database/network failures remain server errors; genuine reservation/unavailability conflicts and stale/repeated status changes return HTTP 409. See [the Phase 1.1 report](BOOKING_PHASE_1_1.md) for tests and remaining limits.

## Before rollout

1. Back up MongoDB and record a restore procedure.
2. Run the read-only `cd server && npm run data:audit` against a staging copy, then the intended database.
3. Review confirmed bookings on the same vendor/date. The new full-day model permits one accepted/completed booking per vendor/day; older slot-based reservations may legitimately collide. Resolve them with customers/vendors before enabling the unique index. Never automatically cancel, merge, or delete bookings.
4. Review missing/null/empty date keys. Backfill eventDateOnly with the YYYY-MM-DD UTC date represented by eventDate, after reviewing timezones and existing data. The compatibility reader handles these records, but the reservation index requires canonical keys for safe rollout.
5. Check invalid eventDate values manually before a backfill. The audit detects invalid BSON date types/ranges and exits nonzero when dates, date keys or collisions need attention.

Example operator-reviewed, additive backfill for records with valid eventDate values (not executed by this refactor):

```javascript
db.bookings.updateMany(
  {
    $or: [
      { eventDateOnly: { $exists: false } },
      { eventDateOnly: { $in: [null, ""] } }
    ],
    eventDate: { $type: "date" }
  },
  [{
    $set: {
      eventDateOnly: {
        $dateToString: { date: "$eventDate", format: "%Y-%m-%d", timezone: "UTC" }
      }
    }
  }]
)
```

Re-run the audit after any approved changes. Do not run `syncIndexes`, `dropDatabase`, or delete legacy collections as part of deployment.

## Booking email rollout Phase 1.2

Phase 1.1 prerequisites and the existing reservation index remain unchanged. Phase 1.2 adds an internal notificationoutboxes collection with unique eventId + recipientUserId and worker scheduling/lease indexes. API startup and worker startup add/wait for these indexes with createIndexes; neither drops indexes or migrates historical bookings. No historical emails are backfilled. Review the new collection/index names in staging before production rollout, then deploy the API and separate worker using the existing SMTP/frontend-origin configuration. Mixed old/new API instances only enqueue events handled by new code, so use a coordinated rollout if every event during cutover must notify. Reverting the API does not remove queued jobs: stop the worker separately if rolling back dispatch. See [BOOKING_PHASE_1_2.md](BOOKING_PHASE_1_2.md) for the exact execution and monitoring instructions and SMTP duplicate-delivery limits.

## Indexes

Phase 1.3 adds optional city/serviceAreas, an internal Vendor.profileRevision and User.bookingGuardRevision, plus an internal vendormoderationaudits collection. Missing revisions behave as zero and initialize only on normal writes; no backfill is needed. Existing location and manual approved/verified legacy records remain readable. New essential-information checks apply to approval decisions; no existing profiles are automatically approved, rejected, or hidden solely as a migration. Unknown non-active account states are now denied consistently (legacy missing/null status remains compatible).

Startup adds `vendor_review_queue_order` on `{ verificationStatus: 1, createdAt: -1, _id: -1 }` and the moderation history index `{ vendorId: 1, createdAt: -1, _id: -1 }`. Existing unique owner and discovery indexes remain. Review db.vendors.getIndexes() and db.vendormoderationaudits.getIndexes() in staging before rollout; do not drop/sync existing indexes. No reservation/outbox index definition changes. Deploy API and frontend together to use inspected revisions, and coordinate old/new mutation writers during cutover: old profile/media/account code does not participate in the new guards. See [VENDOR_PHASE_1_3.md](VENDOR_PHASE_1_3.md) for moderation policy, manual smoke checks and remaining risks. No production data migration or remote deployment was executed.

Startup disables automatic index creation during connection, runs the read-only date preflight, then adds/waits for core indexes with createIndexes and never drops existing indexes. The critical booking index is one_confirmed_booking_per_vendor_date: unique vendorId + eventDateOnly, filtered to accepted/completed states. MongoDB 6+ supports the $in partial filter used here. Index creation fails rather than silently ignoring duplicate legacy reservations.

Older indexes remain in the database even when removed from schema definitions. After backup and staging validation, operators may review obsolete geo/rating/search/slot indexes separately. No automatic drop script is included.

## Compatibility

- User IDs, vendor IDs, booking references, password hashes and existing cookie names remain.
- Legacy verified:true profiles without verificationStatus read as approved; rejected profiles are not promoted.
- String image references normalize to the existing image-object representation when loaded.
- Legacy descriptions fall back to specialRequirements.
- Legacy full-day blockedDates become unavailable dates when read; saving simplified dates persists the new fields.
- Recurring business hours, time slots, vacations and partial-day holidays do not carry their old scheduling behavior into the MVP. Review them and enter whole unavailable dates before rollout where appropriate.
- Pending bookings remain requests and do not reserve dates; acceptance creates the reservation.
- Historical payment/refund/payout fields are ignored, never erased or used to gate bookings.
- DELETE /api/auth/account now deactivates access and preserves history; accounts with pending/accepted bookings cannot deactivate.
- New shareable contactDetails are empty by default. Never backfill them from private User email/phone without the vendor's explicit choice.

## Deployment changes

Remove Razorpay/Stripe, Google Calendar, Twilio/SMS, reminder, invoice, payout and retired notification configuration from active deployment settings. Disable external webhook deliveries and old scheduler processes. The new Phase 1.2 booking email worker is explicitly deployed separately; it does not restore retired notification features. Retired OAuth credentials and stored verification documents remain subject to your own retention/revocation review; this change does not contact external providers.

Set SMTP for recovery/verified email changes and Cloudinary for new vendor photo uploads. Production requires HTTPS UI origins and secure cookies. Cross-site deployments must use COOKIE_SAME_SITE=none; same-site can use lax.

Retain the old deployment/database backup until staging workflows and the first production smoke pass have been reviewed. Reverting source code alone will not undo any independently approved data changes.

## Production readiness Phase 1.4

Phase 1.4 adds no new index definition or automatic backfill. Preserve the Phase 1.1–1.3 rollout steps above. From `server/`, run `npm run data:audit` and `npm run db:preflight` against an isolated restore before release. The new preflight reads topology, every declared core index definition, required field types, status values, canonical dates and duplicate reservation groups. It never creates a collection/index or repairs a record. A fresh database without indexes correctly reports BLOCKED until the separately reviewed additive build is rehearsed. Missing/malformed participant references or unknown booking statuses now also cause API startup refusal; map legacy values only after explicit review.

Startup still performs only additive createIndexes, then verifies the installed definitions before listening; incompatible indexes are never automatically dropped/synchronized. Full preflight findings require operator review, not automatic vendor re-review or customer-data changes. OTP concurrency fixes reuse the existing challenge primary key; no auth index migration is required, and old challenge keys remain readable until normal replacement/expiry.

The [Phase 1.4 release runbook](PRODUCTION_PHASE_1_4.md) documents backup/isolated restore, paused writers, approved legacy repairs, additive builds, preflight, regression/smoke verification and rollback/recovery. Restored outbox jobs retain real recipient snapshots: stop every staging worker until sandbox routing is assured. Source rollback does not unsend notifications or undo later database writes. No production preflight, provider action, migration or deployment was executed by this phase.

## Staging preparation Phase 1.5

The [Phase 1.5 report](STAGING_PHASE_1_5.md) records an executed synthetic BSON restoration into fresh loopback namespaces, with measured duration, identical documents/indexes and restored reservation/outbox constraints. Run `cd server; npm run staging:restore` to repeat that local rehearsal; it accepts no application URI/archive/target. This does not validate Atlas snapshots, mongodump/mongorestore, production RPO/RTO or hosted failover.

No index/schema/data backfill is added in Phase 1.5. Hosted staging must opt into APP_ENV=staging with exact database/provider pins and an authorized test-recipient allowlist before using the existing preflight/worker/admin tools. Use a dedicated database principal scoped to the isolated staging database; leave all conflicting writers/dispatchers stopped during a restored-data review. Staging refuses non-staging Cloudinary deletion IDs and non-allowlisted mail rather than attempting to repair or reroute them. Do not relax pins to permit production data/assets/recipients. The earlier operator-reviewed migration, backup and rollback requirements remain.
