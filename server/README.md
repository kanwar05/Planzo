# Planzo API

Express REST API backed by Mongoose. See the root README for setup and deployment.

## Configuration

See [.env.example](.env.example). Startup requires MongoDB 6+ with replica-set transactions (or a compatible mongos deployment), a valid MongoDB URI and JWT secret of at least 32 characters. Standalone MongoDB is refused. Production additionally requires HTTPS frontend origins and account-recovery SMTP configuration. Cloudinary configuration is optional for read-only browsing, required for photo uploads. Partial Cloudinary or SMTP credential sets are rejected.

Cookie names retain the legacy `eventifyy_access` and `eventifyy_refresh` names for compatibility. Tokens are HttpOnly, Secure in production, and refreshed through opaque, hashed, rotating refresh credentials. Only nonsensitive account fields are returned. Bearer access tokens are supported for API clients. Admin accounts are provisioned with `npm run admin:create`.

JSON responses use `success`, optional `message`, and the relevant resource. Errors use the same shape and appropriate HTTP status. Private account, booking, and admin responses disable caching. Public vendor responses use explicit field allowlists.

## Authentication and account

| Method | Path | Access / purpose |
| --- | --- | --- |
| POST | /api/auth/register | Public; name, email, phone, password, role customer/vendor |
| POST | /api/auth/login | Public; email and password |
| POST | /api/auth/login/otp/request | Public; email; existing generic email OTP delivery |
| POST | /api/auth/login/otp/verify | Public; email and six-digit code; existing JWT session |
| POST | /api/auth/refresh | Valid refresh cookie; atomically rotates credentials |
| POST | /api/auth/logout | Revokes refresh cookie and clears cookies |
| GET | /api/auth/me | Current active user |
| PATCH | /api/auth/profile | Current user; name and phone, no direct email changes |
| PATCH | /api/auth/password | Current user; currentPassword and newPassword |
| POST | /api/auth/forgot-password | Public; generic response, single-use email link |
| POST | /api/auth/reset-password | Public; token and password |
| POST | /api/auth/email-change | Current user; email and currentPassword; sends new-address link |
| POST | /api/auth/email-change/confirm | Public; token; replaces verified address and revokes credentials |
| DELETE | /api/auth/account | Current customer/vendor; password; guarded deactivation, preserves history |

Passwords require 8–128 characters including lowercase, uppercase, a digit and a symbol. Account email links expire after 15 minutes; only hashes are stored. No raw tokens appear in responses or logs. Failed SMTP recovery delivery retains a generic response and invalidates the undelivered token. The first configured CLIENT_URL origin is the email-link destination.

## Vendor marketplace and profile

| Method | Path | Access / purpose |
| --- | --- | --- |
| GET | /api/vendors | Public approved/active profiles; search, category, city, minPrice, maxPrice, page, limit |
| GET | /api/vendors/categories | Public categories |
| GET | /api/vendors/search/meta | Category metadata alias |
| GET | /api/vendors/:id | Public approved/active profile |
| GET | /api/vendors/me | Vendor's own profile and sharing contacts |
| POST | /api/vendors/profile | Vendor creates profile |
| PATCH | /api/vendors/profile | Vendor edits profile; rejected profiles return to pending |
| DELETE | /api/vendors/profile | Vendor only; blocked when booking history exists |
| POST | /api/vendors/images | Vendor multipart profileImage, coverImage, portfolioImages |
| PUT / DELETE | /api/vendors/profile-image | Vendor replaces/removes profile photo |
| PUT / DELETE | /api/vendors/cover-image | Vendor replaces/removes cover photo |
| POST / DELETE | /api/vendors/portfolio | Vendor adds photos (images field) / removes an owned image |

Profile fields: businessName, serviceCategory, description, location, pricing, servicesOffered, contactDetails. Sharing contacts are optional phone/email and never copied from User. Public APIs omit contactDetails entirely. Existing profileImage, coverImage and portfolioImages records remain readable.

Images accept JPEG, PNG or WEBP up to 5MB each, with at most eight portfolio photos. Server-side streams send them to Cloudinary as decoded images under server-generated IDs. Client fields cannot control upload/deletion targets.

## Date availability

| Method | Path | Access / purpose |
| --- | --- | --- |
| GET | /api/vendors/:id/availability | Public approved vendor's unavailable and booked dates |
| GET | /api/vendors/availability | Vendor's own availability, including pending profiles |
| PUT / POST | /api/vendors/availability | Vendor saves unavailableDates / availableDates arrays |
| DELETE | /api/vendors/availability | Vendor resets explicit dates; reserved bookings remain |

Dates use YYYY-MM-DD. All dates are open unless explicitly unavailable or reserved by an accepted/completed booking. availableDates is informational, not an exclusive allowlist. Recurring hours, slots, holidays, vacation rules, and external calendar operations are gone.

Acceptance and availability writes share a per-vendor transaction guard, so acceptance and blocking the same day cannot both succeed. Concurrent partial availability updates re-read omitted fields on retry. Resetting explicit dates never releases a booking reservation.

## Booking requests

| Method | Path | Access / purpose |
| --- | --- | --- |
| POST | /api/bookings | Customer submits vendorId, eventDate, eventLocation, eventType, description, optional notes |
| GET | /api/bookings/my-bookings | Customer's bookings only |
| GET | /api/bookings/vendor-requests | Vendor's incoming bookings only |
| PATCH | /api/bookings/:id/status | Authorized participant/admin changes status; optional reason |

Pending → accepted/rejected/cancelled. Accepted → completed/cancelled. Rejected, cancelled and completed are final.

Customers can only cancel their own pending/accepted bookings. Vendors accept/reject their own incoming pending requests and complete accepted requests. Admins manage allowed transitions. The database enforces one accepted/completed booking per vendor/date, and conditional updates reject stale transitions. Pending requests do not reserve dates. Basic date checks currently use the UTC date boundary on the API.

Both admin endpoints use the same graph; admins can cancel accepted bookings but cannot reopen or cancel terminal states. Same-status accept/reject/cancel repeats retain the existing HTTP 409 contract and leave reasons/timestamps unchanged. Requests racing another transition either commit a legal transition or return 409. Event dates must be real YYYY-MM-DD dates; today is allowed, and acceptance rechecks that a pending request has not become past or unavailable. There is no new requirement to wait until the event day before completing a booking.

Only the associated customer receives intentionally shared vendor contacts on accepted/completed bookings. Vendors and admins can view sharing contacts for authorized management. Customer email/phone and vendor private account contact information are not exposed in booking payloads.

## Booking emails

Successful API booking requests notify the vendor owner; acceptance, rejection and completion notify the customer; cancellation notifies both parties, including the actor when they are a participant. Each change and its notification intent commit in the same MongoDB transaction. Invalid/unauthorized operations, reservation conflicts and repeated HTTP 409 actions enqueue nothing. Email routing reads private account addresses internally; no outbox or recipient fields are returned through the booking API. Bodies omit contact information and link to the authorized dashboard.

Run `npm run email:worker` separately from the API, using the same server environment and existing SMTP/CLIENT_URL configuration. It polls every five seconds, processes serial batches of at most 25, and supports `npm run email:worker -- --once` for a scheduled batch. Atomic claims and token-fenced two-minute leases support multiple workers and recovery after restart. Delivery failures retry with bounded exponential backoff, up to five claims, then remain failed for operator review. No dispatcher runs just by importing app.js. SMTP has an unavoidable accepted-before-acknowledgement crash window, so duplicates are possible despite stable Message-IDs.

See [Phase 1.2](../docs/BOOKING_PHASE_1_2.md) for worker deployment, monitoring, environment requirements, indexes, privacy and failure semantics. Password recovery, OTP and authentication behavior are unchanged.

## Administration

All routes below require an active admin account.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/admin/stats | Basic customer/vendor/booking/status counts |
| GET | /api/admin/users | Paginated registered users, optional role filter |
| GET | /api/admin/vendors | Paginated vendor profiles, optional status filter |
| GET | /api/admin/vendors/unverified | Pending approval profiles |
| PATCH | /api/admin/vendors/:vendorId/verify | Approve business profile |
| PATCH | /api/admin/vendors/:vendorId/reject | Reject profile, optional reason |
| PATCH | /api/admin/users/:userId/suspension | suspended boolean and required reason when suspending |
| PATCH | /api/admin/vendors/:vendorId/suspension | Suspend/restore vendor owner account |
| GET | /api/admin/bookings | Paginated bookings, optional status filter |
| PATCH | /api/admin/bookings/:bookingId | Allowed booking status transition |

## Tests and data

Run `npm run check` and `npm test`. Run `npm run data:audit` for a read-only legacy-data report; it never updates documents or removes collections. Review [migration requirements](../docs/MVP_MIGRATION.md) before deploying to an existing database.

Startup also rejects invalid/mismatched/missing booking day keys before building indexes and serving traffic. The audit reports ID-only date issue samples and genuine reservation collisions grouped by the UTC eventDate, even when stored day keys disagree. See the [Phase 1.1 audit and validation report](../docs/BOOKING_PHASE_1_1.md).
