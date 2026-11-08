# Phase 1.4: production security and release readiness

This phase prepares an existing Planzo release for an isolated staging rehearsal. It does **not** certify the live deployment as ready. No production database, hosting service, credential, Cloudinary asset or SMTP recipient was changed. No deployment or paid service was created. Phase 1.1–1.3 booking rules, moderation policy, API resource shapes and cookie names remain in place. The uncommitted Phase 1.3 work was preserved.

## Initial audit

The root/server READMEs, [Phase 1.1](BOOKING_PHASE_1_1.md), [Phase 1.2](BOOKING_PHASE_1_2.md), [Phase 1.3](VENDOR_PHASE_1_3.md) and [migration guide](MVP_MIGRATION.md) were read before implementation. Actual models, controllers, routes, middleware, startup, worker, indexes, tests and deployment files were inspected. Findings were reported before changes.

| Area | Existing protection | Gap found and response |
| --- | --- | --- |
| Booking/database | MongoDB 6+ replica-set/mongos gate; primary/snapshot/majority transactions; vendor/account guards; unique accepted/completed reservation index; date preflight; explicit additive index creation | Audit covered dates only; connection defaults were unbounded; index definitions were not inspected after creation. Added read-only full preflight, bounded driver settings and installed-index verification. Startup also rejects unknown/malformed booking statuses and invalid participant reference types. |
| Authentication | HttpOnly, host-only `/` cookies; Secure in production; configurable SameSite; hashed rotating refresh credentials; explicit expiry checks; live account/authVersion checks; single-use recovery links | No-Origin cookie mutations accepted any Authorization header even though cookie authentication took precedence. Closed the exemption. Fixed concurrent OTP issue/attempt races and cookie clearing; validated existing configuration bounds. |
| HTTP | Exact CORS origin list, Helmet, body limits, route validation, private-response no-store, IP/auth/recovery limiters | Production HTTP was accepted. Added HTTPS rejection behind explicitly trusted proxies. Health endpoints avoid the global limiter; endpoint-specific auth/recovery limits still apply. |
| Errors/logging | Central error handler; public vendor allowlists; sanitized outbox failure categories | Combined access logs contained URLs/query strings; auth/startup could log raw provider errors; third-party errors carrying statusCode could expose messages. Replaced deployed request/lifecycle logs with safe JSON and hardened production error responses. |
| Images | Role/owner checks before provider calls; 5MB streamed files; JPEG/PNG/WEBP extension/MIME checks; Cloudinary decoding; server-generated IDs; count caps; revision-safe detach/cleanup | Provider timeout implicit. Added explicit 30s SDK socket-inactivity timeout. Provider pixel/quota limits still require staging verification. |
| Worker | Transactional intent, logical uniqueness, bounded retries, atomic leases, fenced acknowledgements, restart recovery, separate CLI | No reusable safe operator report or deployment examples. Added aggregate diagnostics and structured CLI logs; API still has no dispatch loop. |
| Infrastructure | Vercel SPA rewrite; existing environment examples; only VITE_API_URL referenced by application | No Render/CI files; production frontend could fall back to localhost; environment ignore patterns incomplete. Added review-only examples, CI, public-build configuration gate, frontend response headers and secret checks. |
| Dependencies | Existing lockfiles | Registry audit found backend and frontend vulnerabilities. Compatible backend lock updates and the necessary Vitest upgrade address these; no new direct dependency was introduced. Final audits report zero vulnerabilities. |

Authorization continues to enforce booking ownership, vendor ownership, active accounts and admin roles. Public vendor serialization remains an explicit typed allowlist. This phase adds regression evidence instead of replacing those mechanisms.

## Security changes and compatibility

- A production mutation carrying either auth cookie must supply an allowed Origin, including when Authorization is also present. Cookie-free bearer clients retain their existing access. Cross-site requests with missing Origin are refused. This uses the existing Origin-based CSRF architecture.
- Production API requests require `req.secure`, otherwise return 426 without redirecting credentials or trusting Host. Internal health paths remain available over HTTP. Set TRUST_PROXY to the verified proxy-hop count and keep direct origin access behind that proxy. The example uses one hop; confirm the actual route before launch.
- Cookie names remain `eventifyy_access` and `eventifyy_refresh`, with no Domain attribute and Path=/. Clearing uses the same flags without maxAge so Express sets an expired cookie. Refresh expiry and JWT expiry remain server-enforced even if cookie lifetimes differ.
- OTP issuance uses the existing unique `_id` to serialize one challenge per account; legacy randomly keyed challenges remain readable and are superseded on normal issuance. Five total verification claims are reserved atomically before comparison; a correct fifth attempt remains valid. Generation predicates prevent stale requests from consuming or deleting a replacement challenge. No OTP index/data migration is needed.
- Password reset, email change, password hashing, refresh rotation, suspension/deactivation and token revocation retain their existing flows. Logout revokes the presented refresh session and clears browser cookies; an already copied access JWT remains usable until expiry (default 15 minutes), and independent logins remain active. This existing limitation is explicit.
- Access TTL must resolve to 1 second–24 hours; explicit `15m` units are recommended. Rate limits, cookie overrides, database timeouts and slow-request thresholds are bounded at startup. `.env.example` contains placeholders only.
- Production errors omit stacks and provider messages. Mongoose validation returns field errors without rejected values. 404s do not echo URL/query contents. Request IDs are generated locally and returned as X-Request-Id; browser CORS exposes that header.
- Production frontend builds require explicit HTTPS VITE_API_URL and reject every other VITE_* name. All such values are public bundle configuration. Put MongoDB, JWT, SMTP and Cloudinary secrets only in server/worker environment settings.

Rate limiting remains the existing per-process MemoryStore. It resets on restart and does not impose a shared limit across replicas. Keep an explicit instance plan and configure provider/edge abuse controls before scaling. This phase does not add Redis or alter authentication architecture.

## Database preflight and actual results

From `server/`, with an operator-supplied URI targeting the intended **staging** database:

```sh
npm run data:audit
npm run db:preflight
npm run email:diagnostics
```

These commands only read. They do not create collections/indexes, repair dates, update statuses, claim jobs, send mail or replay failures. Prefer a read-only database principal. The preflight needs collection reads, index metadata and hello access; denial exits nonzero with a fixed category. It does not require SMTP/JWT/Cloudinary configuration. Do not paste the URI or raw database documents into tickets.

`db:preflight` exits 0 only for PASS, otherwise 1. It checks:

1. Replica-set/mongos topology and wire version>=17 (MongoDB 6+). This is a minimum compatibility gate, not a claim every supported server version was exercised locally.
2. All 18 declared indexes across eight model collections, including ordered keys, names, unique/sparse/hidden flags, partial filters, TTL and simple collation. Reservation, outbox and moderation indexes use the existing schemas as the source of truth.
3. Required field presence/types, core status enums and the nested outbox recipient role. Compatible missing legacy account/review states remain recognized; unexpected values are reported without printing them.
4. Canonical UTC date keys, invalid dates, mismatches and actual-day duplicate accepted/completed reservations. Samples are capped at 20 groups/IDs with total duplicate-group counts; malformed IDs are not serialized as arbitrary objects.

Executed evidence is from isolated MongoMemoryServer replica-set fixtures: a valid fixture with all 18 indexes and legacy missing verificationStatus returned PASS; an empty database returned BLOCKED for absent indexes without creating any collection. Incompatible reservation/outbox indexes, missing moderation index, unsafe dates, missing fields and malformed statuses returned BLOCKED. Tests compare documents and index metadata before/after. A closed client connection fails safely; reopening resumes checks. A pre-6 server reply is simulated, not an actual old-server execution. **No production or hosted staging preflight was run.**

API startup still waits for explicit `createIndexes()` and never calls syncIndexes/dropIndexes. It now verifies the installed definitions before listening and rejects unsafe booking status/reference/date fields before index creation. The separate full preflight is mandatory during rehearsal/release; noncritical historical vendor/profile anomalies are not automatically repaired or assigned new moderation states. Worker startup verifies its outbox indexes only.

Connection defaults: selection 10s, connect 10s, socket inactivity 20s, pool checkout 5s, retryReads/retryWrites enabled. Existing driver transaction retries and primary/snapshot/majority concern remain; commit is bounded to 10s. Environment overrides are documented in server/.env.example. No custom infinite startup retry loop exists: a failed start exits nonzero for the host supervisor to retry. These are per-stage limits, not a universal end-to-end API timeout.

## Migration rehearsal, backup and restore

Preserve all earlier [migration instructions](MVP_MIGRATION.md). Phase 1.4 adds **no new index definition or automatic data migration**; it validates the indexes already required by Phases 1.1–1.3.

1. Record source/release SHAs, current index definitions, database/server/tool versions and environment variable **names**. Record RPO/RTO and responsible operators. Confirm the backup can actually be restored before scheduling cutover.
2. Take a provider-supported consistent snapshot/PITR backup. If using MongoDB Database Tools, pause writers for a consistent logical export and store it encrypted with restricted access. A protected config file avoids placing credentials in command history:

   ```sh
   mongodump --config /secure/planzo-backup.yml --archive=/secure/planzo-before-phase14.archive --gzip
   mongorestore --config /secure/planzo-staging-restore.yml --archive=/secure/planzo-before-phase14.archive --gzip --nsInclude='planzo.*' --nsFrom='planzo.*' --nsTo='planzo_rehearsal.*'
   ```

   These are operator examples, not executed commands. Use a fresh isolated staging cluster/database, verify namespace mappings against the actual database name, and do not use --drop against production. Config files/backups contain secrets/PII and must stay outside Git.
3. Disable every staging HTTP mutation writer, old API instance, scheduler and email worker during the rehearsal migration. A restored outbox contains real recipient snapshots: keep the worker stopped until messages are routed to a sandbox SMTP sink or recipients are replaced through a separately reviewed staging-only data procedure. CLIENT_URL alone does not reroute email.
4. Run data:audit and db:preflight against the restore. Save the safe reports. A missing required index is an expected BLOCKED result before its approved additive build; other findings require review. Do not silently translate statuses, backfill vendor contacts, cancel reservations or delete records.
5. Review legacy date/timezone intent and conflicting reservations with the business owner. Rehearse approved corrections on the copy using the prior migration guidance. Preserve an operation log and before/after evidence. Unknown status labels need an explicit business decision.
6. With conflicting writers still paused, rehearse additive index creation using the existing reviewed model declarations/API startup. Inspect build time, permissions, disk/headroom and any name/key/partial-filter conflicts. Incompatible existing indexes require a separately reviewed operator change after backup; the application does not drop them.
7. Re-run preflight until PASS and independently inspect the reservation partial unique index (accepted **and** completed), outbox identity/lease indexes and moderation indexes. Run the complete backend booking/auth/worker/vendor regression suite on its isolated fixtures, then the staging smoke checks below. Document duration and rollback observations.
8. Retain the untouched backup and rehearsal reports. Production release remains gated on separately authorized rollout, a fresh backup, a writer pause/coordinated cutover and another preflight. Old writers do not participate in the new revision/account guards.

Rollback before traffic resumes: stop the candidate API/worker, restore the previous application release/configuration and recheck its compatibility with the retained indexes/data. Additive fields/indexes are not automatically removed. Rollback after live writes requires reconciliation; restoring an older database can discard later bookings, moderation changes and outbox state. Prefer a forward fix where safe. Never restore solely to an older outbox snapshot and restart delivery without resolving already sent messages.

## Deployment settings

Examples are intentionally outside an autodiscovered render.yaml: [persistent worker example](../deploy/render.staging.yaml.example) and [alternative cron example](../deploy/render.staging-cron.yaml.example). Merely committing them creates no service. Applying a Blueprint can create billable resources; review costs/settings separately. Auto-deploy is off in these examples.

| Setting | Frontend / Vercel | API / Render | Email process / Render |
| --- | --- | --- | --- |
| Root directory | frontend | server | server |
| Runtime | Node 22, current patched 22.x | Same | Same |
| Install/build | npm ci; npm run build | npm ci --omit=dev | npm ci --omit=dev |
| Output/start | dist; existing SPA fallback | npm start; host-provided PORT | npm run email:worker **or** scheduled npm run email:worker -- --once |
| Health | Real browser/static-route smoke | /api/ready; /api/health or /api/health/live for liveness | Process supervisor/exit state + safe queue diagnostics |
| Public configuration | VITE_API_URL=https://staging-api.example.invalid/api (replace explicitly) | HTTPS CLIENT_URL exact origin(s), TRUST_PROXY verified | Same first CLIENT_URL for message links |
| Cookies | Browser sends credentials through existing API client | Secure/HttpOnly/host-only; none for cross-site, lax for same-site | No browser cookies |
| Database | None | Isolated staging MongoDB 6+ replica set; credentials via secret settings | Same database and existing outbox indexes |
| Secrets | No private secrets or other VITE_* variables | JWT_SECRET, OTP_HMAC_SECRET; SMTP credentials; all three Cloudinary values for uploads | Existing JWT/OTP config required by startup validator; same MongoDB/SMTP/client config; no Cloudinary needed |
| Shutdown | Static deployment rollback | SIGTERM drains HTTP, marks unready; 25s hard deadline; example host 30s | Stops claiming; finishes bounded attempt; 55s hard deadline; example host 90s |

Choose custom domains/HTTPS and verify certificate/DNS routes manually. Prefer same-site UI/API domains if browser third-party-cookie restrictions interfere with cross-site sessions. Confirm login, refresh, logout, password reset and OTP in actual supported browsers. CORS is an exact allowlist; a Vercel preview domain must be explicitly allowed in staging. Do not use wildcard credentials or trust arbitrary forwarded headers. Keep CLIENT_URL's first origin the intended email destination.

For Node runtime and required variables, use [.nvmrc](../.nvmrc), [server environment example](../server/.env.example) and [frontend environment example](../frontend/.env.example). Provision independent strong staging secrets; live credential rotation is outside this execution. Clear one-time ADMIN_* credentials after explicit provisioning.

## Email worker operations

Only the separate process dispatches booking mail. Start from `server/`. Reuse SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_APP_PASSWORD (or supported SMTP_PASS), SMTP_FROM_EMAIL (or supported SMTP_FROM), optional SMTP_FROM_NAME, MONGODB_URI and CLIENT_URL. The production validator also requires JWT_SECRET/OTP_HMAC_SECRET; keep settings consistent with the API. Use a sandbox recipient sink during rehearsal. Verify SMTP TLS, egress, sender authorization, SPF/DKIM/DMARC and provider quotas manually; no real mail was sent by tests.

Persistent worker: `npm run email:worker`. Scheduled alternative: `npm run email:worker -- --once`. Configure **one deployment mode** to avoid accidental duplicate loops. Multiple deliberate workers are safe under atomic leases, but add capacity only after measuring contention/provider limits. Never put the worker into the API start command, Vercel functions or a second hidden scheduler.

Unchanged Phase 1.2 policy: serial batches<=25; persistent poll 5s; max 5 claims; 120s claim lease; outer delivery timeout 45s; real SMTP socket deadline 35s; exponential retry 30s, 60s, 120s, 240s before the fifth claim (policy cap 1h). Expired leases are reclaimable; an expired final claim becomes terminal failed. SIGINT/SIGTERM stops new claims. Forced termination is recoverable through the lease. Synchronize clocks. `--once` exits after one batch; 0 means the batch ran, not that every message succeeded. A full batch can take many minutes during SMTP trouble, so verify scheduler execution limits and backlog capacity.

`npm run email:diagnostics` reports pending/processing/sent/failed/unknown counts, ready count, expired leases, terminal failures, oldest-ready age and bounded ID/event/attempt/time samples. It omits recipient addresses, message payloads, credentials and stored error text. This is an operator CLI, not a public endpoint. Terminal failures require investigation and an explicitly reviewed replay; no automatic replay was added.

SMTP acceptance and database acknowledgement cannot be atomic. A crash or ambiguous timeout after SMTP acceptance can lead to delivery again after recovery. Stable Message-ID, leases and fencing reduce duplicates but cannot guarantee exactly-once inbox delivery. Sent means SMTP accepted. Never replay notifications by reopening bookings or inventing new booking events.

## Monitoring and alerts

- `/api/health` preserves its 200 `{success:true,message:"Planzo API is running."}` contract; `/api/health/live` is an alias. Both are lightweight, no-store and independent of MongoDB/SMTP. They prove the process can answer.
- `/api/ready` returns 200 only when the process is accepting work, the driver is connected and a primary database ping succeeds. Failure/shutdown returns 503 with a fixed message. A 1.5s HTTP deadline and one shared outstanding probe bound work; no provider/connection details are returned. A database outage does not make SMTP an HTTP health dependency.
- JSON request logs include timestamp, level, event, locally generated requestId, method, configured route template, statusCode and durationMs. They exclude actual parameter values, original URLs/query strings, bodies, IPs, cookies, authorization headers and user identities. Successful health probes are quiet.
- Fixed lifecycle events include api_listening/startup_failed/shutdown, database_connected/disconnected/reconnected/error/readiness_changed, email_worker_started/batch/operation_failed/stopped and email_delivery_failed. Transaction retries/failures/slow operations are observed outside the retried callback. No external side effect was added inside transactions.
- SLOW_REQUEST_MS defaults 1000 and marks slow requests/transactions. This provides application performance visibility, not individual query traces. Review provider MongoDB metrics/query plans on staging; do not enable raw Mongoose debug logs or unredacted profiler exports containing user data.

| Suggested alert | Initial threshold / response |
| --- | --- |
| External readiness | Consecutive 503/timeouts for 1 minute; inspect database state and deployment logs. Render uses /api/ready to gate routing/restarts; a shared DB outage can still cause platform restarts. Liveness remains separate for diagnosis. |
| API errors | Sustained 5xx>1% over 5 minutes with meaningful request volume; correlate requestId and safe error category. |
| Latency | p95>1s for 5 minutes; review http_request durations, slow transactions, database CPU/pool/connection counts and query plans. |
| Transaction failures | Any transaction_commit_unknown; repeated database_unavailable/transient failures; investigate reservation/index/replica health without blindly retrying external effects. Expected 409 reservation conflicts are not automatic incidents. |
| Email | Any terminal failure; ready backlog older than 5 minutes across repeated samples; expired leases older than one recovery cycle; worker stopped/crash-looping. Check diagnostics/provider settings before replay. |
| Capacity/backup | Database storage/connection budget, outbox growth, Cloudinary/SMTP quotas, backup age or failed restore rehearsal; define thresholds against the actual provider plan. |

Configure deployment-failure notifications and operator destinations in the existing provider dashboards; no remote alerts were created. Restrict log/backup/diagnostic access, define retention and verify that hosting proxy/access logs also redact sensitive URLs. The application cannot remove secrets already collected by an upstream service.

## Staging smoke and bounded failure checks

From the repository root, configure a deliberately named staging host and explicit confirmation:

```sh
export STAGING_API_URL=https://planzo-staging-api.example.invalid/api
export STAGING_ALLOWED_ORIGIN=https://planzo-staging-api.example.invalid
export STAGING_FRONTEND_ORIGIN=https://planzo-staging.example.invalid
export PLANZO_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING
node scripts/staging-verify.mjs
node scripts/staging-verify.mjs --load
```

Replace example URLs only with an isolated staging deployment. PowerShell uses `$env:NAME='value'` for the same variables. Localhost is also accepted. Remote hosts require HTTPS, a staging name, exact allowed origin and confirmation; production/live names, credentials, redirects and unknown arguments are rejected. The script makes GET requests only, checks health/readiness/CORS/unauthenticated access/public privacy and optionally bounded public listing reads. Defaults 20 load reads/concurrency 4; maximum 200/concurrency 10/30s overall; request timeout defaults 3s/max 10s. It prints checks/status counts/latencies, not response bodies or PII. It is not an authenticated browser or mutation load benchmark. Only its local fixture tests ran here.

Rehearse the following against sandbox providers and disposable staging accounts/data:

1. Login/refresh/logout; invalid/expired/suspended credentials; password-reset single use; OTP cooldown and attempt limits; Origin rejection; Secure/SameSite cookie acceptance; actual HTTPS forwarding and auth IP rate limits. Verify Vercel headers and SPA deep links.
2. Create several pending bookings for one future UTC day, concurrently accept them and verify exactly one reservation. Repeat accept/reject/cancel, cancel then reuse a day, race date blocking, suspension and account deactivation. Inspect outbox intent counts and public privacy. Existing automated suites exercise these operations on isolated databases.
3. Stop/restart the sandbox email worker with a claimed job; wait beyond 120s; confirm recovery/fencing and terminal final-claim handling. Exercise sandbox SMTP rejection/timeouts; ensure HTTP readiness/bookings remain independent.
4. In a dedicated redundant staging replica set, use the provider's supported failover procedure. Observe readiness 503/recovery, transaction retries/rollback, old process shutdown and job leases. Exercise a controlled connectivity outage and restore it. Reconcile final booking/reservation/outbox counts after recovery, including ambiguous commit/delivery outcomes. Local tests cover closed-client recovery and injected transient transaction rollback; **real replica-set election/network-partition testing was not performed**.
5. Try oversized/disguised/foreign uploads, aborted uploads and cleanup outages using a test Cloudinary environment. Verify account image decoding/pixel/credit quotas and SDK inactivity behavior. No new crop/dimension policy is imposed by this phase.
6. Use UTC and positive/negative browser timezones around midnight. Event dates remain literal YYYY-MM-DD with backend UTC today/date keys; the existing browser-local minimum-day boundary can differ from UTC today. Record the difference and agree a business timezone policy before any later behavior change.
7. Review production-volume query plans and bounded latency under the chosen instance/database limits. Inspect mobile/browser workflows without redesigning them. Run the restoration/rollback rehearsal and alert-delivery test, retaining evidence.

## CI quality gates and validation

The new single GitHub Actions workflow has repository-security, backend and frontend jobs, read-only repository permissions, pinned action revisions, time limits and cancellation of superseded runs. It runs backend syntax/tests, frontend tests/build, npm audit at high severity and script tests/secret scanning. It does not deploy, use live secrets, invoke email dispatch or run load tests against a remote URL. Dependency advisories changing later can correctly fail the gate; review remediation rather than suppressing it.

The repository scanner checks tracked/untracked nonignored text and all available local history, reports file/rule/scope only, detects private environment-file paths without reading their contents, and fails if bounded scanning cannot complete. It is a focused pattern scanner, not a guarantee of finding every password/custom secret. Enable GitHub secret scanning/push protection if available; review any historical credential exposure separately without automatic rotation. Real .env files were not tracked. The completed local full-history scan examined 115 commits and reported zero findings; private environment examples remain placeholders.

Existing tests were retained. Local validation used Node 24.21.0/npm 12.1.0 on Windows; the prepared CI/runtime configuration selects current patched Node 22.x, whose hosted run remains pending. Automated MongoDB tests use isolated fixtures; SMTP/Cloudinary are mocked, with existing local fake SMTP transport tests only. Known MongoMemoryServer ECONNRESET teardown diagnostics appear on Windows; the complete suite and process exit successfully.

| Executed check | Result |
| --- | --- |
| Complete backend `cd server; npm.cmd test` (final code) | **176 passed, 0 failed, 0 skipped**, 144.8s |
| Backend `npm.cmd run check` | **71 JavaScript files** passed |
| Complete frontend `cd frontend; npm.cmd test -- --maxWorkers=2` | **127 passed across 22 files**, 0 failed, 21.75s |
| Frontend production `npm.cmd run build` with explicit HTTPS placeholder VITE_API_URL | **Passed**, 2,140 modules, 7.94s |
| Repository scripts `node --test scripts/security-check.test.mjs scripts/staging-verify.test.mjs` | **5 passed, 0 failed** |
| Secret scan `node scripts/security-check.mjs --all-files --history` | **0 findings**,191 current text files plus all 115 local commits |
| Backend `npm.cmd audit --audit-level=high` | **0 vulnerabilities** |
| Frontend dependency audit after fixes | **0 vulnerabilities** |
| `git -c core.safecrlf=false diff --check` | **Passed** |

The 41 additional backend tests cover 12 auth-security cases, 3 environment cases, 1 CSRF regression, 8 readiness/log/error cases, 8 database preflight cases, 3 outbox diagnostics cases, 3 booking concurrency/retry cases and 3 new unsafe startup cases. Existing booking conflicts/cancellations/ownership/date rules, deactivation races, upload limits/privacy, worker restart/lease recovery and transactional rollback tests all remain in the complete suite. The 9 new frontend cases validate public-build configuration; all 118 earlier frontend tests still pass after upgrading the test toolchain.

Backend lock fixes resolve body-parser 1.20.9, multer 2.5.0, nodemailer 10.3.1 and follow-redirects 1.16.2. Frontend uses Vite 6.4.5 and Vitest 4.1.12 with the existing @vitejs/plugin-react 4.7.0 retained; compatible transitive fixes were applied. Vitest's necessary 3-to-4 major upgrade is limited to development tooling and the full suite passes. No runtime feature dependency was added. Initial sandboxed npm/esbuild runs were blocked by network/filesystem restrictions; permitted reruns completed successfully. Registry lookups initially stalled awaiting access; final audited installation and test/build results above are authoritative.

## Files changed in Phase 1.4

The following 53 files are Phase 1.4 changes, including shared files already modified by Phase 1.3. The working tree also retains Phase 1.3-only files; this table does not relabel them as new work.

| Purpose | Files |
| --- | --- |
| Deployment/CI | [.nvmrc](../.nvmrc), [.gitignore](../.gitignore), [.github/workflows/ci.yml](../.github/workflows/ci.yml), [deploy/render.staging.yaml.example](../deploy/render.staging.yaml.example), [deploy/render.staging-cron.yaml.example](../deploy/render.staging-cron.yaml.example) |
| Operator verification | [scripts/security-check.mjs](../scripts/security-check.mjs), [scripts/security-check.test.mjs](../scripts/security-check.test.mjs), [scripts/staging-verify.mjs](../scripts/staging-verify.mjs), [scripts/staging-verify.test.mjs](../scripts/staging-verify.test.mjs) |
| Frontend infrastructure | [frontend/.env.example](../frontend/.env.example), [frontend/package.json](../frontend/package.json), [frontend/package-lock.json](../frontend/package-lock.json), [frontend/vercel.json](../frontend/vercel.json), [frontend/vite.config.js](../frontend/vite.config.js), [frontend/scripts/public-env.mjs](../frontend/scripts/public-env.mjs), [frontend/src/test/frontendEnvironment.test.js](../frontend/src/test/frontendEnvironment.test.js) |
| Server configuration/startup | [server/.env.example](../server/.env.example), [server/package.json](../server/package.json), [server/package-lock.json](../server/package-lock.json), [server/server.js](../server/server.js), [server/src/app.js](../server/src/app.js), [server/src/config/database.js](../server/src/config/database.js), [server/src/config/environment.js](../server/src/config/environment.js) |
| Auth/uploads/errors | [server/src/controllers/authController.js](../server/src/controllers/authController.js), [server/src/middleware/errorMiddleware.js](../server/src/middleware/errorMiddleware.js), [server/src/middleware/upload.js](../server/src/middleware/upload.js), [server/src/utils/generateToken.js](../server/src/utils/generateToken.js) |
| Monitoring | [server/src/middleware/requestLogging.js](../server/src/middleware/requestLogging.js), [server/src/services/readinessService.js](../server/src/services/readinessService.js), [server/src/utils/logger.js](../server/src/utils/logger.js), [server/src/utils/vendorBookingTransaction.js](../server/src/utils/vendorBookingTransaction.js) |
| Database/queue diagnostics | [server/src/utils/bookingDataAudit.js](../server/src/utils/bookingDataAudit.js), [server/src/utils/databasePreflight.js](../server/src/utils/databasePreflight.js), [server/src/utils/outboxDiagnostics.js](../server/src/utils/outboxDiagnostics.js), [server/src/utils/safeDiagnosticValues.js](../server/src/utils/safeDiagnosticValues.js), [server/scripts/auditData.js](../server/scripts/auditData.js), [server/scripts/preflightDatabase.js](../server/scripts/preflightDatabase.js), [server/scripts/outboxDiagnostics.js](../server/scripts/outboxDiagnostics.js), [server/scripts/dispatchBookingEmails.js](../server/scripts/dispatchBookingEmails.js) |
| Backend tests | [server/test/authSecurity.test.js](../server/test/authSecurity.test.js), [server/test/environment.test.js](../server/test/environment.test.js), [server/test/security.test.js](../server/test/security.test.js), [server/test/productionReadiness.test.js](../server/test/productionReadiness.test.js), [server/test/databasePreflight.test.js](../server/test/databasePreflight.test.js), [server/test/outboxDiagnostics.test.js](../server/test/outboxDiagnostics.test.js), [server/test/startup.test.js](../server/test/startup.test.js), [server/test/uploads.test.js](../server/test/uploads.test.js), [server/test/mvpMarketplace.test.js](../server/test/mvpMarketplace.test.js), [server/test/bookingEmailDispatcher.test.js](../server/test/bookingEmailDispatcher.test.js) |
| Documentation | [README.md](../README.md), [server/README.md](../server/README.md), [docs/MVP_MIGRATION.md](MVP_MIGRATION.md), this report |

## Production-readiness matrix

PASS means executed evidence; PENDING means provider/staging verification remains; BLOCKED means launch must wait. Passing local tests alone does not authorize or certify a production launch.

| Control | State | Evidence / outstanding work |
| --- | --- | --- |
| Database topology/index/data preflight is read-only | PASS | Local fixtures, CLI exit codes, before/after records/indexes,18 declared index checks |
| Unsafe startup state refusal | PASS | Local replica/standalone entry-point tests; date/status/reference/index gates |
| Ownership, privacy, booking/availability/outbox/moderation preservation | PASS | Complete backend regression and added concurrency/failure assertions |
| Cookies, OTP, CSRF, validation, rate-limit/error protections | PASS | Auth/security/environment/upload regression tests |
| Health deadline/recovery and safe structured logs | PASS | Local HTTP/driver fixture tests and entry-point primary ping |
| Frontend compatibility/build and dependency security | PASS | 127 tests, production build and both package audits with zero findings |
| CI and staging-script logic | PASS | Local script tests/secret scan; workflow prepared for GitHub |
| GitHub-hosted workflow execution / required branch checks | PENDING | Push candidate branch and configure required checks; no remote run was claimed |
| Actual database upgrade, index timing and legacy-data review | PENDING | Restored staging preflight/rehearsal and separately authorized production checks |
| Backup restore/PITR and rollback recovery | PENDING | Operator rehearsal with measured RPO/RTO |
| Render/Vercel domains, proxy routing and real browser cookies | PENDING | Staging deployment/provider/browser evidence |
| SMTP identity/egress/delivery and Cloudinary resource limits | PENDING | Sandbox/provider verification; no real provider calls executed |
| Monitoring alert destinations and receipt | PENDING | Configure/test provider alerts and restricted retention |
| Redundant replica failover, real connection outages and production-size load | PENDING | Controlled staging fault/load rehearsal |
| Production launch | BLOCKED | Complete mandatory staging/provider/backup gates above and review the candidate release; no production deployment is included |

## Release checklist and rollback

- [ ] All CI jobs green on the exact candidate SHA; review lockfile/toolchain changes and this report.
- [ ] Restore rehearsal complete; fresh backup/PITR verified; isolated staging and production URIs positively distinguished.
- [ ] Preflight findings resolved by reviewed decisions; required indexes verified; no old conflicting writer/scheduler remains.
- [ ] Same API/frontend release, HTTPS origins/API URL, proxy trust and actual browser cookie flows validated.
- [ ] Exactly the intended persistent worker or cron mode enabled; sandbox delivery approved before production recipients; safe queue diagnostics/alerts operational.
- [ ] Secret settings are server-only, provisioning credentials cleared, provider quotas/retention agreed, dependency/secret checks clean.
- [ ] Booking, availability, moderation, authentication, upload and privacy smoke checks complete; failover/load limits recorded honestly.
- [ ] Operator owners, release window, rollback SHA/config snapshot and incident communication path recorded.

For a bad frontend release, restore the previous Vercel deployment with its matching public API URL. For a bad API release, stop traffic/mutations if consistency is uncertain, stop the worker independently when delivery is implicated, and roll Render back to the reviewed compatible SHA/config. Source rollback does not revert data, clear leases or unsend messages. Keep additive fields/indexes unless a separate reviewed migration requires otherwise. After rollback, verify health/readiness, preflight, booking counts/reservations and outbox state before resuming traffic/dispatch. For corruption requiring restore, preserve incident evidence, stop every writer/worker, restore to an isolated database first and reconcile post-backup writes/sent notifications before selecting a recovery target. Do not automatically delete data, reset terminal jobs or rotate live credentials.

## Known limits and remaining manual tasks

Besides the pending matrix rows: MemoryStore limits are per process; copied JWTs survive logout until expiry; SMTP delivery can duplicate; the outbox retains private snapshots and needs a retention/capacity policy; Cloudinary detach cleanup can leave orphan assets; legacy revisionless clients provide weaker human-inspection guarantees; contains-search/legacy city filters can scan candidates; unrelated already-authorized requests are not retroactively cancelled by suspension. Existing UTC/local-day boundary behavior is unchanged. No payments, chat, reviews, frontend redesign or later phase was started.

## Sources and Community Wisdom

Primary references: [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), [health/shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/), [Render deployment/shutdown lifecycle](https://render.com/docs/deploys), [Render Blueprint reference](https://render.com/docs/blueprint-spec), [Vite public environment variables](https://vite.dev/guide/env-and-mode), and [MongoDB per-stage timeout guidance](https://www.mongodb.com/docs/drivers/node/v6.x/connect/connection-options/csot/). The latter warns about CSOT in the installed driver generation; this implementation uses per-stage timeouts/maxTimeMS and avoids timeoutMS.

### 🌐 Community Wisdom: [PM2 + Express + NextJS: zero downtime deploys](https://dev.to/alexeydc/pm2-express-nextjs-with-github-source-zero-downtime-deploys-n71)
> **Source**: [Alexey](https://dev.to/alexeydc)
> **Tags**: `node`, `nextjs`, `tutorial`, `javascript`
>
> The author's deployed example coordinates readiness and cleanup with its process supervisor. [Dzung Nguyen's Express shutdown example](https://dev.to/dzungnt98/graceful-shutdown-in-nodejs-express-1apl) similarly stops accepting connections before exit. Neither inspected discussion had comments; these are implementation examples, not broad consensus. Planzo keeps its existing Node process model and uses Render's documented lifecycle rather than adding PM2. DevRelay tools were unavailable, so public articles/discussions and official documentation were inspected directly.
>
> 🔗 [Read Full Discussion](https://dev.to/alexeydc/pm2-express-nextjs-with-github-source-zero-downtime-deploys-n71)

A DEV draft or session export can be prepared separately if requested; neither was created or published. Stop after Phase 1.4.
