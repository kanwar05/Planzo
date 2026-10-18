# Planzo MVP migration guide

No migration has been executed against application data. Removing a Mongoose field or model does not erase stored MongoDB documents. The MVP preserves retired collections, payment records, verification documents, and Cloudinary assets.

## Before rollout

1. Back up MongoDB and record a restore procedure.
2. Run the read-only `cd server && npm run data:audit` against a staging copy, then the intended database.
3. Review confirmed bookings on the same vendor/date. The new full-day model permits one accepted/completed booking per vendor/day; older slot-based reservations may legitimately collide. Resolve them with customers/vendors before enabling the unique index. Never automatically cancel, merge, or delete bookings.
4. Review missing/null/empty date keys. Backfill eventDateOnly with the YYYY-MM-DD UTC date represented by eventDate, after reviewing timezones and existing data. The compatibility reader handles these records, but the reservation index requires canonical keys for safe rollout.
5. Check invalid eventDate values manually before a backfill. The audit assumes existing dates are valid BSON dates and exits nonzero when date keys/collisions need attention.

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

## Indexes

Startup adds/waits for core indexes with createIndexes and never drops existing indexes. The critical booking index is one_confirmed_booking_per_vendor_date: unique vendorId + eventDateOnly, filtered to accepted/completed states. MongoDB 6+ supports the $in partial filter used here. Index creation fails rather than silently ignoring duplicate legacy reservations.

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

Remove Razorpay/Stripe, Google Calendar, Twilio/SMS, reminder, invoice, payout and notification configuration from active deployment settings. Disable external webhook deliveries and old scheduler processes. Retired OAuth credentials and stored verification documents remain subject to your own retention/revocation review; this change does not contact external providers.

Set SMTP for recovery/verified email changes and Cloudinary for new vendor photo uploads. Production requires HTTPS UI origins and secure cookies. Cross-site deployments must use COOKIE_SAME_SITE=none; same-site can use lax.

Retain the old deployment/database backup until staging workflows and the first production smoke pass have been reviewed. Reverting source code alone will not undo any independently approved data changes.