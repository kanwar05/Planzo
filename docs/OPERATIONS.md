# Planzo operations

This runbook describes the existing API, database checks and durable booking-email worker. It does not certify any hosted deployment. Environment templates are [server/.env.example](../server/.env.example) and [frontend/.env.example](../frontend/.env.example); API contracts are in [server/README.md](../server/README.md).

## Runtime and deployment

Use Node.js 22 or newer; [.nvmrc](../.nvmrc) selects Node 22. MongoDB must provide replica-set or mongos transactions and meet the MongoDB 6 minimum compatibility gate. Use a supported database release and redundant replica set in production.

| Process | Directory | Install/build | Start/output |
| --- | --- | --- | --- |
| Frontend | `frontend` | `npm ci`, `npm run build` | `dist`, with SPA fallback |
| API | `server` | `npm ci --omit=dev` | `npm start` |
| Booking email worker | `server` | `npm ci --omit=dev` | `npm run email:worker` or scheduled `npm run email:worker -- --once` |

The frontend and server use separate lockfiles. Root npm scripts orchestrate local verification; they do not install subproject dependencies. The existing [Vercel configuration](../frontend/vercel.json) handles frontend headers and fallback. Configure backend and worker hosting explicitly; no backend deployment manifest is present.

Set `NODE_ENV=production`, `MONGODB_URI`, independent random `JWT_SECRET` and `OTP_HMAC_SECRET` values of at least 32 characters, exact HTTPS `CLIENT_URL` origins and SMTP settings on the server. Configure all three Cloudinary values to enable uploads. Partial SMTP or Cloudinary configuration is rejected. Keep secrets in the host's server/worker settings, outside Git and frontend build variables.

Build the frontend with `VITE_API_URL` set explicitly to the intended HTTPS API URL including `/api`. Only `VITE_API_URL` and Vercel's `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` are allowed `VITE_*` variables; both are public configuration. Missing, plaintext, credential-bearing, query-bearing or fragment-bearing API URLs are refused by the production-build validator.

## Proxy, browser and authentication settings

Production API requests require HTTPS as determined by Express. Set `TRUST_PROXY` to the verified number of trusted proxy hops and prevent clients from bypassing that proxy. The default is zero. Internal health endpoints remain available over HTTP.

Set `COOKIE_SAME_SITE=none` for cross-site UI/API deployments, or `lax` for same-site deployments. Production cookies remain Secure, HttpOnly, host-only and scoped to `/`; legacy names `eventifyy_access` and `eventifyy_refresh` are intentional compatibility details. Browser third-party-cookie restrictions still require testing on the actual chosen domains.

`CLIENT_URL` is an exact origin allowlist; its first origin supplies email links. Cookie-authenticated mutations require an allowed `Origin`, including requests also carrying `Authorization`. Cookie-free bearer clients retain their existing behavior. Configure preview origins explicitly in staging.

Verify login, OTP, refresh, logout, password recovery and email changes with supported browsers and actual staging providers. Password changes, email confirmation, account deactivation and suspension revoke credentials as implemented. Logout revokes the presented refresh session and clears its cookies; an already copied access token retains its existing validity until expiry. Per-process rate-limit stores reset on restart and do not impose a shared limit across API replicas.

## Database preflight and rollout

Use a separately selected staging database for rehearsal. With its server environment configured, run from `server/`:

```sh
npm run data:audit
npm run db:preflight
npm run email:diagnostics
```

These commands read data and metadata. They do not repair records, create indexes, claim jobs or send mail. Prefer a read-only database principal with the necessary collection, index-metadata and topology access. Do not paste connection strings or raw database documents into reports.

`data:audit` checks canonical UTC booking date keys, invalid/mismatched dates, actual-day reservation collisions and remaining legacy approval/availability fields. It returns bounded ID-only samples. `db:preflight` additionally checks transaction-capable topology, required installed index definitions, core field/reference types and statuses. A missing index or unsafe finding causes a nonzero exit; an empty database can therefore fail preflight before initial index creation.

API startup validates topology and unsafe booking fields/dates, explicitly creates declared indexes, verifies installed definitions and waits before listening. It does not call `syncIndexes`, drop indexes or repair records. Worker startup creates/verifies its outbox indexes. The existing reservation partial unique index protects accepted and completed bookings for one vendor/day. Preserve outbox logical-event uniqueness, queue/lease indexes, moderation indexes and all model declarations.

For an existing database:

1. Record release identifiers, current index definitions, database/tool versions and environment variable names. Take a consistent backup and verify restoration into an isolated database before cutover.
2. Keep staging writers and workers stopped while preparing a restored copy. Restored outbox jobs contain real recipient snapshots: use a sandbox SMTP sink or a separately reviewed staging-only recipient procedure before dispatch. Changing `CLIENT_URL` only changes links.
3. Run the read-only audits. Review invalid dates, UTC day-key intent, duplicate reservations, malformed references/statuses and legacy approval/availability records. Corrections require a separately reviewed data procedure; never automatically cancel bookings, invent contacts or approve legacy vendors.
4. Rehearse approved corrections and additive index creation on the copy with competing writers paused. A missing index before its first approved build is expected; an incompatible installed definition requires an explicit operator decision. The application will not drop it.
5. Repeat preflight until it passes, then run local regressions and staging checks. Measure index-build time and review database permissions, disk capacity and rollback compatibility.
6. Coordinate production cutover with a fresh backup and a writer pause where necessary. Old API/worker releases may not participate in current revision guards or enqueue notification intents. Historical bookings are not automatically emailed.

Preserve retired collections/fields until retention and compatibility have been reviewed separately. The booking-security rollout adds nullable email ownership proof, credential-version binding on OTP challenges and optional private booking retry metadata with a partial unique index. No ownership backfill or booking rewrite is performed. Follow [booking security rollout](BOOKING_SECURITY.md#database-and-rollout) before serving the updated API.

The package/quotation release adds two collections, four secondary indexes and optional commercial booking snapshots. Follow [commercial database and rollout](PACKAGES_QUOTATIONS.md#database-and-rollout): drain older API writers, complete additive startup/index checks with traffic held, rerun preflight, then deploy the matching UI. Legacy bookings need no fabricated agreement backfill. Do not roll commercial bookings back to API writers that can bypass customer quotation acceptance.

## Booking email worker

The booking messaging release adds `bookingconversations`/`bookingmessages`, five secondary indexes, a private booking write guard, `message_received` jobs and a terminal `skipped` outbox state. Deploy API and worker together after draining old workers. Follow [messaging deployment and staging](BOOKING_MESSAGING.md#deployment-and-staging-checklist) for the socket proxy, cookies, single-process realtime scope, optional `MESSAGING_HTTP_RATE_LIMIT_MAX`, retention and notification-suppression checks. Retired `conversations`/`messages` data is preserved without migration.

Run one explicit deployment mode: a persistent supervised worker, or a scheduled one-batch process. The API does not dispatch booking email. The worker uses the same `MONGODB_URI`, SMTP configuration and first `CLIENT_URL` origin as the API; shared environment validation also requires the existing authentication secrets. Keep host clocks synchronized.

```sh
cd server
npm run email:worker
# Scheduled alternative:
npm run email:worker -- --once
```

Booking changes and notification intent commit in the same MongoDB transaction. Delivery failures do not alter booking status. Invalid, unauthorized, conflicting and repeated HTTP 409 status actions enqueue no new notification intent.

| Existing delivery setting | Value |
| --- | --- |
| Persistent poll | 5 seconds |
| Serial batch | At most 25 jobs |
| Maximum claims per job | 5 |
| Processing lease | 120 seconds |
| Sender total deadline | 35 seconds |
| Outer delivery budget | 45 seconds |
| Retry delays before the final claim | 30, 60, 120, 240 seconds |
| Worker shutdown hard deadline | 55 seconds |

Atomic claims, lease tokens and conditional acknowledgements support deliberate multiple workers and recovery after interruption. `SIGINT`/`SIGTERM` stop new claims and allow the current bounded attempt to finish. Abandoned claims recover after lease expiry. A batch can take many minutes during provider trouble; confirm scheduler limits and capacity. A successful `--once` exit means the batch ran, not that every message was delivered.

SMTP acceptance and database acknowledgement cannot commit atomically. A crash or ambiguous timeout after acceptance may cause a duplicate delivery despite stable Message-IDs. Sent means SMTP accepted, not confirmed inbox delivery. Terminal failures require investigation and a separately reviewed replay; no automatic replay or retention cleanup exists. Never replay mail by reopening bookings or generating artificial booking events.

`npm run email:diagnostics` reports aggregate states, ready backlog, expired leases, terminal failures, oldest-ready age and bounded safe samples. It omits recipient addresses, payloads, credentials and raw provider errors. Alert on increasing queue age, expired leases, terminal failures and a stopped worker. Verify provider TLS, sender authorization, egress, quotas and inbox delivery in staging.

## Health and logs

- `GET /api/health` and `/api/health/live` provide lightweight process liveness independently of MongoDB and SMTP.
- `GET /api/ready` checks connected-driver state, shutdown state and a primary database ping with a 1.5-second HTTP deadline. Failure returns 503 with a fixed message; it does not depend on SMTP or Cloudinary.
- Request/lifecycle logs use safe JSON and generated `X-Request-Id` values. Do not add raw request bodies, tokens, query strings, provider errors or recipient payloads to operational logs.

Database connection selection, connection, socket-inactivity and pool-checkout waits are bounded; defaults and supported overrides are in the server environment template. These are individual stage limits, not a universal API request deadline. Use readiness to remove unavailable instances from traffic and a supervisor to restart failed processes.

## Verification and staging probes

From the repository root, after installing both subprojects:

```sh
npm run check
npm test
npm run check:security
npm --prefix server audit --audit-level=high
npm --prefix frontend audit --audit-level=high
```

Build with an explicit HTTPS `VITE_API_URL` as described in the [root README](../README.md#verification). Backend tests use isolated MongoMemoryServer fixtures rather than `MONGODB_URI`. Browser QA scripts use fixture responses and do not prove hosted integrations.

The staging probe script makes GET requests only, omits credentials, refuses redirects and bounds load. Remote targets must use HTTPS, contain a `staging` hostname segment and avoid `prod`, `production` or `live` segments. Set all of the following explicitly before invoking it:

```text
STAGING_API_URL=https://staging-api.example.invalid/api
STAGING_ALLOWED_ORIGIN=https://staging-api.example.invalid
STAGING_FRONTEND_ORIGIN=https://staging.example.invalid
PLANZO_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING
```

Replace the illustrative `.invalid` hosts with the intended staging origins, then run:

```sh
node scripts/staging-verify.mjs
# Optional bounded read load after smoke checks pass:
node scripts/staging-verify.mjs --load
```

Loopback URLs are also supported for local checks. Optional bounds are `STAGING_REQUESTS` (maximum 200), `STAGING_CONCURRENCY` (maximum 10), `STAGING_TIMEOUT_MS` (maximum 10000) and `STAGING_DURATION_MS` (maximum 30000). Probes cover health/security headers, readiness, public-listing privacy, unauthenticated booking rejection, configured CORS and untrusted-origin rejection. They do not exercise authenticated booking concurrency or actual email/upload delivery.

## Razorpay payment staging and rollout

1. Confirm the deposit percentage, platform commission, accounting treatment, refund authority and customer-facing terms with the business and compliance owners. The code defaults (`PAYMENT_DEPOSIT_BPS=3000`, `PLATFORM_COMMISSION_BPS=0`) are assumptions only, not approved commercial terms. Existing cancellation policies define timing but no refund formula; refunds therefore require a documented manual admin decision.
2. Use an isolated staging database with replica-set transactions. Back it up, run `npm --prefix server run db:preflight`, and verify payment/refund/webhook/ledger indexes before accepting test transactions. Keep the API and existing email worker deploy plan coordinated.
3. Configure server-only Razorpay test credentials (`RAZORPAY_MODE=test`, `RAZORPAY_KEY_ID=rzp_test_*`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). Do not place secrets in frontend variables. Set `TRUST_PROXY` to the actual trusted proxy hop count (normally `1` behind a single trusted hosting proxy); verify HTTPS and CORS preflight from the exact staging frontend origin.
4. Configure the Razorpay test webhook at `/api/payments/webhook` for `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed` and `refund.failed`. Preserve raw request bytes at the proxy and confirm invalid signatures are rejected. Verify retries, duplicate event deliveries and unmatched events appear in reconciliation reporting.
5. From a verified staging customer account, accept a quotation, create a deposit, exercise successful/failed Checkout attempts, verify the signature callback, and confirm the webhook independently. Verify idempotent and concurrent order creation, balance gating, integer-paise totals, history, receipt/invoice downloads and notification delivery. Confirm the PDFs are not presented as tax invoices.
6. Exercise admin-only partial/full refunds, concurrent reservations, provider pending/failed/ambiguous outcomes, event replay, reconciliation exception resolution and email delivery. Confirm cancellation policy and cancellation-record snapshots are present, and verify operators—not software—apply the manual refund decision.
7. Compare payment/refund records, the append-only ledger, provider dashboard and admin financial aggregates. Confirm the vendor payable totals remain held and that no payout request is sent. Record staging evidence and exception ownership before any production decision.
8. Keep live keys rejected and vendor payouts disabled until provider capability, legal/compliance obligations, commercial terms, support procedures and financial reconciliation are separately approved. After any release, monitor webhook delivery, open reconciliation exceptions, payment/refund states and the existing email outbox; do not resolve exceptions without an evidence-backed note.

The staging gateway is not a payment test harness: the checklist above requires authenticated browser flows and provider test-mode events. Rollback must preserve payment/refund/audit records and reconcile provider-side transactions before changing deployment state.

## Rollback and release evidence

Stop candidate API and worker processes separately. Reverting API source leaves committed outbox jobs and additive indexes intact. Before resuming an earlier release, verify its compatibility with current data/indexes and reconcile delivery state. Restoring an old database after new writes can lose bookings and moderation changes; restoring an old outbox can resend mail. Retain backups and reconcile post-backup writes before any restore.

Production-readiness evidence still requires actual hosted database preflight, browser/proxy/cookie behavior, SMTP and Cloudinary checks, supervisor recovery, supported-browser testing, backup restoration and failover rehearsal. Record only checks actually executed; a passing local build or fixture test does not establish those results.
