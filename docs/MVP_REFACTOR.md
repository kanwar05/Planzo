# Planzo MVP refactor report

Completed locally on branch refactor/planzo-mvp. No commit, push, deployment, or destructive database migration was performed. The pre-existing frontend/src/App.jsx change is preserved.

## Audit and resulting architecture

The original app combined marketplace/booking logic with payments, installments, refunds, payouts, Socket.IO chat, Google Calendar, notifications/jobs, review moderation, favorites, document verification, analytics and preference/session UI. These crossed booking, vendor, authentication, startup, and navigation boundaries.

The existing MERN architecture remains: frontend React/Vite/Tailwind, server Express/Mongoose, JWT/HttpOnly cookies. Five active persistence models remain: User, Vendor, Booking, Availability and internal RefreshToken. Categories are a static shared vocabulary; no new service or framework was introduced.

Work proceeded through domain decoupling, removal of retired modules/routes, simplified frontend flows, configuration/security cleanup, and validation. Git working-tree safety was checked before edits.

## Retained behavior

- Customer/vendor signup, secure login/logout, cookie refresh, profile editing, strong password changes, SMTP password reset, verified new-email confirmation, guarded deactivation.
- Approved-only marketplace discovery with vendor/service text, category, city and price filters; business descriptions, services, starting prices and real photos.
- Date-only booking requests and pending/accepted/rejected/cancelled/completed states, ownership enforcement and conditional status transitions.
- Database uniqueness for accepted/completed vendor dates, including a forced-concurrency integration test. Cancellation releases the reservation.
- Business contacts deliberately provided by a vendor stay out of public responses. Only the booking's customer receives them after acceptance/completion; there is no fallback to private User contacts.
- Simple unavailable dates and reserved dates, customer/vendor booking dashboards, admin user lists, approvals/rejections, suspensions, basic counts, and booking management.
- Existing coral/plum visual identity and responsive layouts, with loading/error/empty/success states.

## Removed behavior

Retired frontend routes/pages/components/services and backend routes/controllers/services/models/jobs for online payments/refunds/disputes/payouts/invoices, chat/presence/attachments, Google Calendar/OAuth/ICS, notifications/reminders/SMS, reviews, favorites, advanced analytics/exports, document verification, preferences, theme controls, device/session UI, advanced availability, and audit-log UI were removed. An obsolete Razorpay SDK script and duplicate archived dashboard files were also removed.

Old provider and scheduler configuration is absent from active examples/startup. Existing .env files and database collections were not erased.

## Important files

- frontend/src/routes/AppRoutes.jsx: retained route surface and role-aware redirects.
- frontend/src/pages/: simple marketplace, booking, customer/vendor/admin and account flows.
- frontend/src/components/BookingCard.jsx, BookingMetrics.jsx, BookingStatus.jsx and Pagination.jsx: reusable basic dashboard UI.
- frontend/src/context/AuthContext.jsx and services/: cookie-based account state and core APIs; retired local user cache removed.
- server/src/controllers/bookingController.js and models/Booking.js: authorization, transitions, date reservations and safe serialization.
- server/src/controllers/vendorController.js and services/vendorSearchService.js: approved search, opt-in business contacts and compatible profile/photo storage.
- server/src/controllers/adminController.js: basic administration and counts.
- server/src/controllers/authController.js, middleware/authMiddleware.js and services/accountEmailService.js: credential security, account recovery/email verification and deactivation.
- server/src/middleware/upload.js: small bounded Cloudinary image-stream adapter with server-generated IDs and cleanup.
- server/server.js and src/config/environment.js: validated startup and core-index readiness.
- server/scripts/auditData.js: read-only migration readiness report.
- Package manifests/lockfiles, both env examples, root/server READMEs and migration guide.

## Dependencies

Removed from backend: razorpay, pdfkit, socket.io, socket.io-client, multer-storage-cloudinary, nodemon. Development now uses Node's built-in watch mode.

Removed from frontend: socket.io-client, react-big-calendar, date-fns. Framer Motion remains actively used for the existing design. The Vite React plugin is correctly classified as a development dependency.

Cloudinary and Nodemailer were updated to patched major versions (2.11 and 10.1 respectively); compatible security updates were applied to retained lockfile packages. The Cloudinary adapter was replaced to avoid its old SDK peer restriction. Node.js 22+ is the documented backend runtime.

## Data and deployment

No application database was opened for migration or modified by this work. Tests used isolated MongoMemoryServer databases. The data audit was itself tested to detect collisions without changing records.

Review [MVP_MIGRATION.md](MVP_MIGRATION.md) before an existing-data rollout: backfill canonical eventDateOnly keys, resolve same-date legacy confirmed reservations, and review old recurring/vacation/slot restrictions. Startup adds/waits for core indexes with createIndexes; it never calls syncIndexes or drops old collections/indexes.

Set production MongoDB/JWT/HTTPS origins, SMTP recovery delivery and Cloudinary photo credentials. Choose cookie SameSite for same-site/cross-site hosting, configure actual proxy hops, and build with the deployed VITE_API_URL. Disable retired external webhook deliveries and scheduler processes.

Administrator provisioning no longer has hardcoded account details or silently promotes an existing email. Rotate any accounts that previously used the old seed password.

## Validation performed

| Check | Result |
| --- | --- |
| Backend full test suite | 50 passed, 0 failed/skipped |
| Additional contact/cache regression run | 8 marketplace tests passed after authenticated response cache protection |
| Backend syntax check | Passed, 41 JavaScript files |
| Frontend tests | 32 passed across 11 files |
| Frontend production build | Passed, Vite 6.4.3 |
| Actual production backend startup/health | Passed against isolated MongoDB |
| Read-only legacy-data audit | Tested against isolated legacy fixtures; records unchanged |
| Headless Chrome responsive checks | 42/42 page/viewport checks at 375, 768, 1440px |
| Browser navigation checks | 18/18 passed |
| Browser runtime/overflow/dead links/unexpected API requests | None found |
| Backend npm audit, all dependencies | 0 reported vulnerabilities |
| Frontend npm audit, production dependencies | 0 reported vulnerabilities |

Tests ran on Node 24.21.0 and installed MongoDB 9.0.2. Browser tests intercepted all 102 API/XHR/fetch requests with local fixtures; they verify rendering, navigation and responsive behavior, not live provider delivery. The backend integration tests exercise actual isolated database authorization and concurrency.

Browser report/screenshots are ignored local QA artifacts under frontend/.cache/. The final production JS bundle is approximately 456KB (144KB gzip); existing photography assets are retained.

Initial baseline checks were blocked by the Windows sandbox's default MongoDB cache path and Vite/esbuild config-resolution access. The portable test runner uses a workspace cache, tests used an installed mongod, and frontend checks were rerun with the required local execution access. Those initial failures are not presented as passing results.

## Known limits and follow-up

- Live SMTP delivery and Cloudinary uploads were not exercised with real credentials. Complete provider smoke tests in staging before rollout.
- Existing production data was not available for review; the migration audit/backfill and index readiness remain deployment prerequisites.
- Full frontend npm audit still reports 10 development-tool findings in the retained Tailwind 3/Vitest 3 dependency trees. Runtime dependency audit is clear. Addressing those requires a separate major build/test-tool upgrade; no forced Tailwind/Vitest migration was applied. Serve the compiled static build in production.
- Explicit availability edits and booking acceptance are separate document operations; confirmed-booking collisions are database-enforced, but concurrent edits of blocked dates are not transactional.
- Backend date validation uses the UTC day boundary; scheduling is whole-date, without appointment times.
- Deactivation preserves history; permanent erasure/retention procedures remain operator-managed.
- No standalone linter was configured; syntax checks, tests, build and browser QA were run instead.

## Community Wisdom

Only one relevant DEV post was inspected, with no comments; this is limited anecdotal context, not a community consensus. Technical upload/cookie/index behavior was checked against official Cloudinary, Nodemailer, Express and MongoDB documentation.

### 🌐 Community Wisdom: [Stop overengineering your SaaS MVP. Here's what actually ships.](https://dev.to/muhammadtanveerabbas/stop-overengineering-your-saas-mvp-heres-what-actually-ships-2g9e)
> **Source**: [Muhammad Tanveer Abbas](https://dev.to/muhammadtanveerabbas)
> **Tags**: `saas`, `webdev`
>
> The author's experience favors a small application with essential validation over speculative infrastructure. This refactor keeps the existing MERN app and reduces its feature surface; it does not adopt the article's alternative stack.
>
> 🔗 [Read Full Discussion](https://dev.to/muhammadtanveerabbas/stop-overengineering-your-saas-mvp-heres-what-actually-ships-2g9e)