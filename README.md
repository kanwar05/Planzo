# Planzo

Planzo is a MERN event-services marketplace for discovering approved vendors and sending booking requests. It keeps the existing React/Vite/Tailwind frontend and Express/Mongoose backend.

## MVP features

- Customers register, sign in, search vendors, request bookings, follow status, cancel eligible requests, and manage their account.
- Vendors manage business information, services, starting prices, photos, intentionally shared business contacts, booking requests, and unavailable dates.
- Admins view users and bookings, approve/reject profiles, suspend accounts, and view basic counts.
- Search supports vendor/service name, category, city, and starting-price range. Categories include photography.
- Booking states are pending, accepted, rejected, cancelled, and completed. Accepted/completed bookings reserve one vendor date.
- A customer's accepted/completed booking reveals only business contacts the vendor explicitly provided for sharing. Public APIs never return them or private account contacts.
- HTTP-only cookie authentication, rotating refresh tokens, strong password hashing, single-use password recovery, and verified email changes remain.

Payments, refunds, payouts, chat, external calendars, favorites, reviews, notification feeds/schedulers, document verification, advanced analytics, and preference/session-management screens have been removed.

## Local setup

Use Node.js 22 or newer and MongoDB 6 or newer. Run a supported MongoDB release in production.

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

Defaults: frontend http://localhost:5173, API http://localhost:5001/api. Health: `GET /api/health`.

Configure SMTP to exercise password recovery, email-address verification, and customer/vendor email OTP sign-in. For Gmail, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_APP_PASSWORD` (a Google App Password), `SMTP_FROM_NAME`, and `SMTP_FROM_EMAIL`. Set a separate random `OTP_HMAC_SECRET` (at least 32 characters). `OTP_EXPIRY_MINUTES` defaults to 5 and `OTP_RESEND_COOLDOWN_SECONDS` defaults to 60. Raw email tokens and OTPs are never returned through the API. Configure all three Cloudinary values to enable vendor photo uploads; browsing existing photos does not require upload credentials.

## Administrator provisioning

Set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, and a strong `ADMIN_PASSWORD` in the server environment, then run `npm run admin:create`. Clear provisioning credentials after use. The command refuses to overwrite an existing account or promote it by email. Public registration never creates administrators.

## Verification

```sh
cd server
npm run check
npm test

cd ../frontend
npm test
npm run build
```

Backend tests use isolated MongoMemoryServer databases, never the configured application database. The test runner downloads a test binary into ignored `server/.cache/mongodb` when needed. To use an installed MongoDB executable, set `MONGOMS_SYSTEM_BINARY` and matching `MONGOMS_VERSION` before `npm test`.

## Deployment

1. Back up existing data and follow [the migration guide](docs/MVP_MIGRATION.md). Run `npm run data:audit` before rollout; it is read-only.
2. Set production `MONGODB_URI`, a random `JWT_SECRET`, HTTPS `CLIENT_URL` origins, and SMTP delivery configuration. Set Cloudinary credentials for photo uploads.
3. Use HTTPS. Choose `COOKIE_SAME_SITE=none` for cross-site UI/API deployments, or `lax` for same-site deployments. Production cookies are Secure and HttpOnly.
4. Set `TRUST_PROXY` to the actual number of trusted proxy hops; the default is zero. Keep the API behind that proxy if enabling proxy trust.
5. Build the frontend with its deployed `VITE_API_URL`. Configure SPA fallback to `index.html`; `frontend/vercel.json` already supports this.
6. Install backend production dependencies with `npm ci --omit=dev`, then run `npm start`. Startup validates configuration and waits for core indexes before listening.
7. Remove retired integration secrets/webhooks and old scheduled tasks from the deployment. No background jobs run in the MVP.

The API checks browser origins for cookie mutations; non-browser cookie clients in production must send an allowed Origin header. Password changes, email confirmation, deactivation, and suspension revoke existing credentials. Deactivation retains account and booking history.

[API reference](server/README.md) · [Migration guide](docs/MVP_MIGRATION.md) · [Refactor and validation report](docs/MVP_REFACTOR.md)