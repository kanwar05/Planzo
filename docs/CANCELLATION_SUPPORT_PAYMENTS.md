# Cancellation, support, and payment readiness

This release adds auditable cancellation and support workflows without
processing payments, refunds, fees, or vendor payouts.

## Cancellation policies

Cancellation policies are immutable, versioned records. The active policy is
used for new booking requests and quotation revisions. Quotation acceptance
requires an exact `{ key, version }` acknowledgment, and the accepted
agreement stores an immutable policy snapshot and acknowledgment timestamp.

New policy cutoffs are measured from midnight at the start of the stored UTC
event calendar day, interpreted in the policy time zone. Published policies
use `Asia/Kolkata` (IST). Historical snapshots without a time-zone field
retain their original UTC interpretation. Legacy bookings without a snapshot
use grandfathered terms and are never rewritten.

The current lifecycle rules are:

- Customers may cancel their own pending or accepted booking when the
  applicable customer cutoff has not passed.
- Vendors may cancel their own pending or accepted booking only with a
  sanitized reason and before the vendor cutoff.
- Administrators may cancel a mutable booking. After a cutoff, an explicit
  override and reason are required.
- Rejected, cancelled, and completed bookings are terminal. A successful
  cancellation records the actor, role, time, reason, previous state, policy
  source, policy snapshot, and whether an administrator override was used.
- Cancellation and acceptance use the same transaction and vendor guard.
  Cancellation removes the accepted/completed date reservation by leaving the
  booking in a terminal state; pending bookings never reserve a date.
- No cancellation path calculates or promises a refund, cancellation fee, or
  payout.

## Support and disputes

Support cases are booking-scoped and can be opened by the verified customer or
vendor. Supported categories cover vendor non-response, cancellation
disagreements, no-shows, non-delivery, quality complaints, and future
payment/refund questions. One active case per booking/category is enforced,
and creation/update retries use idempotency keys and optimistic revisions.

Cases retain the booking status and accepted-agreement snapshot from the time
they are opened. Append-only events record creation, public updates,
assignment, investigation, resolution, closure, reopening, private notes,
and evidence. Participants see only participant events. Administrator notes,
provider identifiers, hashes, and uploader identities are excluded from
participant serializers and email payloads.

Evidence is stored as authenticated Cloudinary media under server-generated
identifiers. The API validates MIME type, extension, decoded image format,
size, count, ownership, case membership, revision, and idempotency before
serving a private byte stream. Evidence is never exposed as a public or
client-selected provider URL.

Status transitions are `open -> investigating -> resolved -> closed`.
Resolved or closed cases may be reopened only by an administrator with a
reason. Support decisions do not silently modify booking status, accepted
commercial terms, reservations, or financial state.

## Payment readiness contract

Until a payment provider is introduced, the domain intentionally keeps these
state machines separate:

| State machine | Future responsibility | Current behavior |
| --- | --- | --- |
| Booking | Request, acceptance, service lifecycle, cancellation | Existing `Booking.status`; no payment side effects |
| Payment | Deposit/balance authorization, capture, failure, expiry | Not implemented |
| Refund | Eligibility decision, provider refund request, partial/full result | Not implemented |
| Vendor payout | Payable amount, hold, release, failure, reversal | Not implemented |

Future payment work must use immutable references captured at the accepted
agreement boundary:

- `bookingId`, `quotationId`, agreement revision, policy version, and currency
  (`INR`) are internal references.
- Monetary values are integer paise. Never derive a financial amount from a
  current package, profile, or mutable quotation.
- Provider payment, order, refund, payout, webhook, and reconciliation
  identifiers must be unique, immutable, and stored separately from
  customer-facing state.
- Every command needs an idempotency key scoped to its operation and booking.
  Retries must return the original result, not create a second provider action.
- Provider webhooks must verify the provider signature against the raw request
  body, reject replayed event identifiers, and record receipt and processing
  outcomes in an append-only audit trail.
- Reconciliation must compare provider records with local immutable references,
  quarantine mismatches, and provide operator retry/replay without changing
  history.
- Timeout, duplicate delivery, provider rejection, partial refund, and
  uncertain-result recovery paths must be explicit before enabling money
  movement.

The intended future calculation boundary is:

1. Read the accepted agreement snapshot and policy snapshot.
2. Calculate deposit, remaining balance, cancellation fee, refund, and payout
   amounts in integer paise on the server.
3. Persist an immutable calculation input/output record before issuing a
   provider command.
4. Execute the provider command with an idempotency key.
5. Reconcile the provider result asynchronously; never infer success from a
   client redirect.

No provider credentials, payment transactions, mock money movements, or payout
logic belong in this release.

## Notifications and rollout

Booking cancellations and support case creation, assignment, public updates,
resolution, closure, reopening, and evidence additions enqueue durable
notification intents in the same MongoDB transaction as the domain change.
Emails contain only a generic case link and routing-safe metadata; private
notes, evidence, account contacts, and case text are not included.

Before staging rollout:

1. Back up the database and run the read-only data audit and database
   preflight.
2. Ensure the replica set, Cloudinary authenticated upload configuration, SMTP
   worker, and HTTPS origins are configured.
3. Build the frontend with an explicit HTTPS `VITE_API_URL`.
4. Confirm indexes for cancellation policies, support cases, support events,
   booking reservations, and notification outbox are installed.
5. Exercise customer, vendor, and administrator cancellation races; support
   authorization; private evidence access; notification retries; and legacy
   bookings in staging.
6. Monitor failed outbox jobs, orphaned evidence cleanup, policy publication
   conflicts, and support-case transition errors.
7. Roll back by disabling new policy publication and support entry points;
   never rewrite immutable policy, cancellation, agreement, or support-event
   records.
