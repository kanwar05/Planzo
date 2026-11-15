# Planzo

Planzo is a MERN event-services marketplace for discovering approved vendors and sending booking requests. It keeps the existing React/Vite/Tailwind frontend and Express/Mongoose backend.

## Existing functionality

- Customers register, sign in, search vendors, request bookings, follow status, cancel eligible requests, and manage their account.
- Vendors manage business information, services, starting prices, photos, intentionally shared business contacts, booking requests, and unavailable dates.
- Vendor setup includes city/coverage, essential-detail completion, private preview, profile/cover/portfolio management and rejection/resubmission. Material public content changes require re-review; price, shared-contact and availability edits retain approval.
- Admins view users and bookings, approve/reject profiles, suspend accounts, and view basic counts.
- Listing approval is manual content review, not identity verification. Admin moderation uses inspected revisions, transactional suspension and an internal audit history.
- Search supports vendor/service name, category, city, and starting-price range. Categories include photography.
- Booking states are pending, accepted, rejected, cancelled, and completed. Accepted/completed bookings reserve one vendor date.
- Successful booking requests and status changes enqueue durable email notifications. A separate MongoDB-backed worker delivers them with retries; SMTP failures do not change booking state.
- A customer's accepted/completed booking reveals only business contacts the vendor explicitly provided for sharing. Public APIs never return them or private account contacts.
- HTTP-only cookie authentication, rotating refresh tokens, strong password hashing, single-use password recovery, and verified email changes remain.
- Customers/vendors can use email OTP or passwords.
- Customer booking creation and vendor marketplace writes require verified email ownership. Existing accounts can still sign in, view history, manage their account and cancel their own eligible bookings while completing verification.
- Booking dates use UTC calendar days throughout the API and UI. Completion is permitted only after the full event date has elapsed.
- Booking creation supports customer-scoped `Idempotency-Key` retries; the booking form reuses a key while retrying an unchanged request. Cancellation/rejection dialogs collect optional reasons.
- Vendors manage structured INR service packages; customers can select one or keep a custom booking request. Package selection survives safe login/registration redirects.
- Vendors send itemized quotation revisions. Customer acceptance saves the exact commercial agreement and reserves the date atomically; quoted/package bookings require that acceptance. Existing custom requests without quotations retain direct vendor acceptance.

Payments, refunds, payouts, chat, external calendars, favorites, reviews, notification feeds/schedulers, document verification, advanced analytics, and preference/session-management screens have been removed.

## Architecture

```text
Planzo/
├── .github/workflows/       # CI quality and security gates
├── docs/                   # Cleanup record and operating instructions
├── scripts/                # Repository security and staging checks
├── frontend/
│   ├── public/             # Public fonts, licenses and favicon
│   ├── scripts/            # Public-build validation and manual browser QA
│   └── src/
│       ├── assets/         # Bundled application images
│       ├── components/     # Shared UI and dashboard parts
│       ├── context/        # Authentication state
│       ├── data/           # Service-category presentation data
│       ├── hooks/
│       ├── layouts/
│       ├── pages/
│       ├── routes/
│       ├── services/       # HTTP clients grouped by resource
│       ├── test/           # Shared frontend test setup
│       └── utils/
└── server/
    ├── scripts/            # Database checks, worker and verification commands
    ├── src/
    │   ├── config/
    │   ├── controllers/
    │   ├── middleware/
    │   ├── models/
    │   ├── routes/
    │   ├── services/
    │   ├── utils/
    │   └── workers/         # Durable booking-email delivery
    └── test/               # Isolated backend regression tests
```

The frontend and server keep separate dependency manifests and lockfiles. Root commands orchestrate them without npm workspaces or shared runtime dependencies. Frontend component and page tests stay beside the code they exercise. See the [cleanup record](docs/CLEANUP.md) for the changes and remaining review items.

## Local setup

Use Node.js 22 or newer; [.nvmrc](.nvmrc) selects Node 22. MongoDB 6 or newer must support replica-set transactions (Atlas is suitable). Local development can use an initialized single-node replica set named rs0; production should use a supported MongoDB release and a redundant replica set. Standalone MongoDB cannot run booking/availability transactions and startup refuses it. See [database preflight and rollout](docs/OPERATIONS.md#database-preflight-and-rollout) before upgrading an existing database.

```sh
cd server
npm ci
cp .env.example .env
# Set MONGODB_URI and a random JWT_SECRET of at least 32 characters.
npm run dev
```

In a second terminal:

```sh
cd frontend
npm ci
cp .env.example .env
npm run dev
```

On Windows PowerShell use `Copy-Item .env.example .env` and `npm.cmd` if script execution policy blocks `npm.ps1`.

Defaults: frontend http://localhost:5173, API http://localhost:5001/api. Liveness: `GET /api/health`; database readiness: `GET /api/ready`.

Configure SMTP to exercise password recovery, email-address verification, and customer/vendor email OTP sign-in. For Gmail, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_APP_PASSWORD` (a Google App Password), `SMTP_FROM_NAME`, and `SMTP_FROM_EMAIL`. Set a separate random `OTP_HMAC_SECRET` (at least 32 characters). `OTP_EXPIRY_MINUTES` defaults to 5 and `OTP_RESEND_COOLDOWN_SECONDS` defaults to 60. Raw email tokens and OTPs are never returned through the API. Configure all three Cloudinary values to enable vendor photo uploads; browsing existing photos does not require upload credentials.

Booking emails reuse that SMTP configuration and the first `CLIENT_URL` origin. From `server/`, run `npm run email:worker` as a separate persistent process, or `npm run email:worker -- --once` as a scheduled batch. Without a worker, committed notifications remain queued. See [worker operations and delivery limits](docs/OPERATIONS.md#booking-email-worker) before enabling production dispatch.

## Administrator provisioning

Set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, and a strong `ADMIN_PASSWORD` in the server environment, then run `npm run admin:create`. Clear provisioning credentials after use. The command refuses to overwrite an existing account or promote it by email. Public registration never creates administrators.

## Verification

After installing dependencies separately in `server/` and `frontend/`, run from the repository root:

```sh
npm run check
npm test
npm run check:security
```

`check` runs backend JavaScript syntax checks. `test` runs operational-script tests, backend tests and frontend tests sequentially; `npm run test:operations` runs the operational tests independently. There is currently no ESLint configuration or lint command. `check:security` scans tracked/untracked source and local Git history and reports paths and rule names without printing matched credential values.

Production builds require an explicit HTTPS API endpoint:

```sh
# POSIX shell; replace with the intended deployment endpoint.
VITE_API_URL=https://staging-api.example.invalid/api npm run build
```

```powershell
$env:VITE_API_URL = 'https://staging-api.example.invalid/api'
npm.cmd run build
```

Dependency audit commands are `npm --prefix server audit --audit-level=high` and `npm --prefix frontend audit --audit-level=high`.

Backend tests use isolated MongoMemoryServer databases, never the configured application database. The test runner downloads a test binary into ignored `server/.cache/mongodb` when needed. To use an installed MongoDB executable, set `MONGOMS_SYSTEM_BINARY` and matching `MONGOMS_VERSION` before `npm test`.

Manual browser checks use isolated API fixtures and an installed Chrome executable. After building, run `node frontend/scripts/verify-ui.mjs` or `node frontend/scripts/measure-ui.mjs` from the root. Set `CHROME_PATH` when Chrome is not at the scripts' Windows default. These checks do not verify hosted integrations.

## Deployment

1. Back up existing data and follow [database preflight and rollout](docs/OPERATIONS.md#database-preflight-and-rollout). From `server/`, run the read-only `npm run data:audit` and `npm run db:preflight` commands before rollout.
2. Set production `MONGODB_URI`, independent random `JWT_SECRET` and `OTP_HMAC_SECRET` values, HTTPS `CLIENT_URL` origins, and SMTP delivery configuration. Set Cloudinary credentials for photo uploads.
3. Use HTTPS. Choose `COOKIE_SAME_SITE=none` for cross-site UI/API deployments, or `lax` for same-site deployments. Production cookies are Secure and HttpOnly.
4. Set `TRUST_PROXY` to the actual number of trusted proxy hops; the default is zero. Keep the API behind that proxy if enabling proxy trust.
5. Build the frontend with an explicit HTTPS `VITE_API_URL`, including `/api`. Production builds reject missing/plaintext endpoints and any `VITE_*` name except `VITE_API_URL` and Vercel's `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG`. All such values are public; never put server secrets in them. Configure SPA fallback to `index.html`; `frontend/vercel.json` already supports this.
6. Install backend production dependencies with `npm ci --omit=dev`, then run `npm start`. Startup validates configuration, transaction support and canonical booking dates, then waits for core indexes before listening.
7. Remove retired integration secrets/webhooks and old scheduled tasks from the deployment. Deploy the booking email worker separately with the same server environment, automatic restart and access to MongoDB/SMTP. The API does not dispatch email itself.

The API checks browser origins for cookie mutations; non-browser cookie clients in production must send an allowed Origin header. Password changes, email confirmation, deactivation, and suspension revoke existing credentials. Deactivation retains account and booking history.

Review the [operations runbook](docs/OPERATIONS.md) before upgrading an existing marketplace. Existing review/audit indexes and optional fields are additive; no automatic production-data migration is performed.

The server includes read-only `npm run db:preflight` and `npm run email:diagnostics`, bounded database settings, safe request/lifecycle logs, security regressions and CI. Production API traffic requires HTTPS through the configured trusted proxy; cookie mutations always require an allowed Origin even when Authorization is present. Health probes remain accessible internally over HTTP. Follow the [staging verification instructions](docs/OPERATIONS.md#verification-and-staging-probes) before launch. No backend hosting service is provisioned by the repository. Backup restoration, actual browser/provider behavior and hosted failover still require staging evidence.

[API reference](server/README.md) · [Operations](docs/OPERATIONS.md) · [Cleanup and validation record](docs/CLEANUP.md)

See [booking security and rollout](docs/BOOKING_SECURITY.md) for the email-verification policy, additive database fields/index, UTC boundaries, retry contract and verification evidence.

See [packages, quotations and rollout](docs/PACKAGES_QUOTATIONS.md) for the commercial workflow, API additions, new collections/indexes, compatibility rules and staging checks. Drain older API writers before enabling commercial bookings.
