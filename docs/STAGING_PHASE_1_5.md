# Phase 1.5: staging preparation and release sign-off

**Production recommendation: NO-GO.** The user selected “Prepare locally; hosted setup is pending.” This phase prepares and executes isolated local checks. No Render/Vercel/Atlas service, domain, live credential, production record, customer recipient or provider asset was changed. No billable service or public deployment was created. Hosted staging and production verification are separate outstanding gates.

This report builds on [Phase 1.4](PRODUCTION_PHASE_1_4.md), [Phase 1.3](VENDOR_PHASE_1_3.md), [Phase 1.2](BOOKING_PHASE_1_2.md), [Phase 1.1](BOOKING_PHASE_1_1.md), the [migration guide](MVP_MIGRATION.md) and root/server READMEs. All were reviewed with the actual deployment, CI, preflight, readiness, worker, image and email code before implementation. Booking transitions, reservation rules, moderation policy and cookie authentication architecture remain unchanged.

Local evidence applies to the Phase 1.5 working tree based on ae44567, not a deployed candidate. The release operator must commit/review the final candidate and run its hosted gates on that exact SHA. Local validation used Windows and Node 24.21.0; the prepared Node 22 CI run has not been executed remotely.

## Initial audit and changes

| Existing support | Missing evidence/protection | Phase 1.5 response |
| --- | --- | --- |
| Review-only Render web/worker and alternative cron examples; Vercel SPA/security config; Node 22 CI | No hosted staging services or supplied URLs | Reuse examples, add explicit staging isolation settings and document dashboard setup. No provisioning performed. |
| Read-only db:preflight/data:audit; 18 declared indexes; startup guards; health/readiness | Backup/restore instructions had not been executed | Add a synthetic BSON logical-copy rehearsal, record actual measurements and verify restored data/index constraints. Hosted snapshot/PITR restore remains pending. |
| Native Chrome/CDP UI and measurement scripts | Existing scripts fulfill API responses from fixtures; Vitest is jsdom, so neither proves real browser sessions/transactions | Add a separate local real-stack browser rehearsal, with no API response replacement. Relevant browser execution results are recorded below. |
| Transactional outbox and separately deployed worker; sanitized diagnostics | Staging could use copied recipient/provider configuration | Add opt-in APP_ENV=staging checks before connection/send/upload/delete. Test exact recipient rules on every email path. |
| Server-generated owned image IDs and safe detach/cleanup | Staging used the same public-ID namespace as production | New staging IDs use eventifyy/staging/; staging refuses provider deletion outside that prefix and checks the configured cloud name. |
| HTTPS-only public production build configuration | Staging frontend could accidentally build against a production API | APP_ENV=staging in the build process additionally requires a staging API hostname. No extra VITE_* variable is exposed. |
| Structured logs, bounded smoke reads, dependency/secret gates | No hosted alerts, browser matrix, provider delivery or workload measurements | Preserve honest PENDING gates and provide specific verification/evidence instructions. |

## Environment isolation

APP_ENV is a new opt-in deployment label. Set **APP_ENV=staging and NODE_ENV=production** on hosted staging; NODE_ENV=staging is invalid. Older deployments with APP_ENV absent retain their existing behavior. Local synthetic rehearsals explicitly own their environment and use NODE_ENV=test; they do not read application .env files or use configured application database credentials.

The staging pins are application safeguards against common configuration mistakes. They do **not** prove a cloud account is isolated, revoke a powerful credential's privileges, authenticate a DNS/SRV target as “nonproduction”, or make a real SMTP relay into a sandbox. Use dedicated provider projects/environments, scoped credentials, network restrictions and sandbox delivery controls. Verify these in the dashboards before any hosted run.

| Variable | Staging requirement / safe handling |
| --- | --- |
| NODE_ENV / APP_ENV | production / staging on API and worker; frontend build APP_ENV=staging |
| MONGODB_URI | Explicit isolated staging database; never reuse a production credential/URI. Keep secret. |
| STAGING_MONGO_HOST | Exact hostname in the MongoDB URI, without port/path/credentials |
| STAGING_DATABASE_NAME | Exact URI database, e.g. planzo_staging; must contain a staging token and must not contain a production/live token |
| JWT_SECRET / OTP_HMAC_SECRET | Independently generated staging secrets, at least 32 characters; keep server-only |
| CLIENT_URL / STAGING_FRONTEND_ORIGIN | The same single HTTPS staging frontend origin; paths, alternate production origins and trailing slash are refused |
| TRUST_PROXY | Actual verified proxy-hop count; example 1 only when topology is confirmed |
| COOKIE_SAME_SITE | none for cross-site UI/API, or lax for same-site; hosted NODE_ENV=production sets Secure/HttpOnly host-only cookies |
| SMTP_HOST / STAGING_SMTP_HOST | The same sandbox capture host; do not use production mailbox delivery credentials |
| SMTP_PORT / SMTP_SECURE | Exact sandbox provider's port/TLS settings, verified separately |
| SMTP_USER / SMTP_APP_PASSWORD | Sandbox credentials; SMTP_PASS remains the existing supported fallback |
| SMTP_FROM_EMAIL / SMTP_FROM_NAME | Authorized test sender identity; SMTP_FROM remains supported where already documented |
| STAGING_EMAIL_MODE | sandbox; any other mode is refused |
| STAGING_EMAIL_RECIPIENTS | At most 10 exact authorized test addresses, comma-separated. No wildcards, groups, comments, display names, header/list syntax or non-ASCII aliases. No production recipient lists. |
| CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET | Separate staging product environment/credentials if uploads are enabled; all three required together |
| STAGING_CLOUDINARY_CLOUD_NAME | Must match CLOUDINARY_CLOUD_NAME when staging assets are configured; public IDs also use a staging-only prefix |
| VITE_API_URL | Only approved public VITE_* key; explicit HTTPS staging API URL ending /api for frontend build |
| PORT | Hosting-assigned API port; worker has no HTTP port |
| ADMIN_NAME / ADMIN_EMAIL / ADMIN_PHONE / ADMIN_PASSWORD | Explicit one-time provisioning of a disposable staging admin; clear the password afterward |

The code checks the database pin in shared connection options, so API/worker, read-only diagnostics/preflight and admin provisioning use it. Staging DB pins without APP_ENV=staging are rejected to catch a forgotten mode flag. Staging email checks run before the account recovery/email-change, OTP and booking senders invoke their transport; non-allowlisted jobs are refused rather than rerouted. Existing outbox attempts/terminal handling remain unchanged. A restored production recipient must never be added to the test allowlist to make a job pass.

The staging URI guard supports an Atlas SRV URI or a single-host seed URI with an explicit database path; use SRV for multi-node discovery. Alternate dbName/loadBalanced query modes are refused case-insensitively. Provider routing/privileges still need verification; these restrictions apply only to opt-in staging.

Image writes keep the existing server-generated UUID IDs and ownership rules, adding the eventifyy/staging/ prefix only in staging. Old references outside that prefix cannot be deleted by staging code, including cleanup paths. Provider deletion remains best effort after database detach; a refused cleanup can leave an asset for review. A separate Cloudinary product environment is the provider boundary, while the prefix is additional protection. Never change pins merely to let staging delete an old production reference.

`npm run staging:check` from server/ validates configuration without opening database/SMTP/Cloudinary connections, printing only fixed check names/status. It does not certify live credentials, recipient ownership, sandbox behavior or DNS. The API adds X-Robots-Tag:noindex,nofollow in staging; crawler directives are not authentication/access control.

## Hosted dashboard setup: prepared, not executed

1. **Choose the candidate SHA and owners.** Keep production deployment disabled. Review costs before creating any service/cluster/product environment. Use a dedicated staging branch/project and record provider IDs in restricted operator records. No secrets belong in Git, frontend variables or evidence files.
2. **Atlas:** create or select a separately authorized staging project/cluster and database named planzo_staging. Confirm a supported MongoDB 6+ replica-set deployment. Create an app user scoped to that database and cluster, with only required read/write/index privileges, and a separate read-only audit user where practical. Restrict network access to intended service/operator egress. Atlas project users and database users are different; do not grant staging readWriteAnyDatabase over production.
3. **Sandbox SMTP:** create/select an authorized capture inbox with external delivery disabled. Create synthetic customer/vendor/admin addresses and enter only these in STAGING_EMAIL_RECIPIENTS. Record how an operator retrieves OTP/reset/booking messages from that inbox. Do not copy production SMTP credentials, even if a recipient allowlist is enabled.
4. **Cloudinary:** select a separate staging product environment and credentials. Verify its name against STAGING_CLOUDINARY_CLOUD_NAME and inspect limits. Use synthetic test images only. No upload or destructive provider operation was executed here.
5. **Render:** use a separate staging project/environment and staging-only environment group. Select the reviewed [web/worker example](../deploy/render.staging.yaml.example); it is not an autodiscovered render.yaml and was not applied. API root=server, build=`npm ci --omit=dev`, start=`npm start`, Node 22, health=/api/ready, auto-deploy off. Fill the exact pins/secrets above and confirm proxy trust/HTTPS forwarding. Prevent cross-environment private networking where supported; public endpoint/network policies still need review.
6. **Worker:** deploy one separate persistent worker with root=server and `npm run email:worker`, host shutdown allowance90s; or use the [cron alternative](../deploy/render.staging-cron.yaml.example) with `npm run email:worker -- --once`. Choose one mode, not two accidental loops. The cron group's variables must include the same staging pins/JWT/OTP/MongoDB/SMTP/CLIENT_URL settings. Keep it stopped until data and sandbox routing are checked.
7. **Vercel:** use a dedicated staging project or an authorized Preview/custom environment; root=frontend, Node 22, install=`npm ci`, build=`npm run build`, output=dist, existing SPA/security config. Set build-process APP_ENV=staging and only public VITE_API_URL=https://planzo-staging-api.example.invalid/api after replacing the placeholder with the actual isolated service. Do not import production variables into it. Choose a stable HTTPS staging domain and access protection supported by the selected plan; confirm redirect/CORS behavior under protection. Do not run vercel --prod as part of this preparation.
8. Set CLIENT_URL/STAGING_FRONTEND_ORIGIN to the actual frontend origin and rebuild/redeploy only through a separately authorized staging action. Verify certificates, DNS and actual browser cookies. Same-site custom domains may reduce third-party-cookie issues but are not proof of compatibility.
9. Configure existing provider deploy-failure/health/queue alerts and restricted log retention, recording a successful test notification to the operator. No remote alert route was configured or triggered here.

Provider guidance was checked against [Render environment isolation](https://render.com/docs/projects), [Vercel environments](https://vercel.com/docs/deployments/environments), [Atlas database-user scoping](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) and [Cloudinary public IDs](https://cloudinary.com/documentation/upload_parameters). Availability/cost of provider features must be checked for the chosen account before provisioning.

## Database and restoration evidence

The existing read-only `npm run data:audit`, `npm run db:preflight` and `npm run email:diagnostics` remain the hosted operator checks. First run `npm run staging:check` using explicitly scoped settings. Do not invoke production URIs through staging scripts.

The new `npm run staging:restore` accepts **no URI, file or target argument**. It starts its own loopback MongoMemoryReplSet and creates fresh source/restore namespaces with generated identifiers. It seeds only synthetic records, captures an in-memory BSON logical snapshot and actual index metadata, restores into an empty target, verifies BSON/index equality, reruns preflight, and proves reservation/outbox uniqueness. It refuses existing targets rather than dropping data. It never reads MONGODB_URI or an application .env file, contacts an email provider or starts a dispatcher.

Recorded executable evidence: [phase-1-5-restore.json](evidence/phase-1-5-restore.json).

| Measurement/check | Executed result |
| --- | --- |
| Scope/method | Isolated local, quiescent synthetic BSON logical copy; no provider snapshot/Database Tools/PITR |
| Dataset | 20 documents, 8 collections, 7,578 BSON bytes |
| Required/restored indexes | 18 declared required indexes; 26 including each collection's _id index |
| Source/restored preflight | PASS / PASS; MongoDB 6+ compatibility and replica-set capability verified |
| Backup / restore duration | 36.16ms / **1285.18ms**, including restored collection/index creation |
| Total measured work | 4588.89ms before cleanup; not a production RTO |
| Data/constraint checks | Exact BSON/index equality; read-only checks preserve source/target; reservation and outbox duplicates rejected |
| Failures | None in the recorded run |
| Emails / hosted verification | 0 / none |

The eight collections are users, vendors, bookings, availabilities, refreshtokens, emailotps, notificationoutboxes and vendormoderationaudits. All booking states and retry/lease/terminal outbox states are represented. BSON tests include dates, IDs, binary and numeric fidelity. This is evidence that this synthetic logical copy restores; it does not validate Atlas backups, provider retention, storage encryption, real-volume migration timing or disaster recovery.

For the hosted rehearsal, retain the [Phase 1.4 backup/restore procedure](PRODUCTION_PHASE_1_4.md#migration-rehearsal-backup-and-restore) and earlier migration guidance: obtain an authorized snapshot or use synthetic records, restore only into isolated staging, pause all writers/workers/schedulers, review unsafe dates/statuses and required fields, apply separately approved additive migrations, verify all index definitions, run preflight and regressions, then allow sandbox dispatch. Record actual start/end/duration, snapshot identity, target isolation, counts, failure/recovery notes and responsible operator. Do not restore raw customer data or enable queued real recipients in an Internet-accessible staging service.

## Local browser and workflow evidence

The new local browser rehearsal uses the existing native Chrome/CDP approach rather than adding Playwright or a browser service dependency. Its harness creates disposable users, a replica-set database, the actual Express API, frontend server and loopback SMTP capture. It never uses hosted URLs/application .env data. Account/admin setup is limited to that synthetic database. API requests are not fulfilled from fixtures. Cloudinary is mocked; browser network requests outside local origins are refused.

Executed evidence: [phase-1-5-browser.json](evidence/phase-1-5-browser.json), run b03abb55-d2b9-4f84-8890-68e71e0ec9c3, **22/22 checks PASS**, process exit 0 after cleanup, Chrome 157.0.8103.39 on Windows/Node 24.21.0. The actual React frontend and Express API ran on different loopback ports against one disposable replica-set member. No API response was replaced. Three synthetic roles, one vendor and five bookings were exercised; Cloudinary was mocked and all 17 SMTP receipts stayed in a loopback-only capture (15 booking notifications plus OTP/recovery). No hosted recipient or provider was contacted.

The checks cover homepage navigation, customer/vendor registration, HttpOnly/JavaScript cookie isolation, password login/logout/refresh revocation, access-cookie refresh, browser cookie expiry/unauthorized access, Origin CSRF refusal, OTP login, single-use password recovery, profile/portfolio UI, rejection/correction/resubmission, admin approval/public discovery, search/filter/pagination request semantics, protected contacts, booking request/accept/complete/reject/cancel with receipts, concurrent acceptance, suspension/restoration, deactivation and final database/outbox consistency. Pagination was checked with one result/page; multi-page UI/representative data remains a hosted check. Browser cookie expiry is forced through CDP; actual expired/wrongly signed JWTs are separately covered by backend tests. Real elapsed session TTL behavior and Secure/SameSite cross-site policy remain hosted checks.

Final stored state: completed 1, rejected 1, cancelled 3; pending/processing/failed email rows 0; sent rows 15 equal booking SMTP receipts 15; moderation audit records 4. All five booking event subjects were captured, with text/plain and text/html MIME parts and the intended local participant dashboard link verified. Sender authentication/TLS/deliverability are not tested by this local sink.

Run from server/ after installing existing server/frontend dependencies:

```sh
npm run staging:restore
npm run staging:browser
```

Chrome must be installed; set CHROME_PATH to its executable if needed. The browser CLI accepts no URL/target arguments, removes inherited provider/database settings, creates its own accounts/services, and refuses external browser navigation/requests. It uses an empty Vite envDir instead of the application .env. A 180s watchdog, separate cleanup deadline and per-resource cleanup attempts bound failure handling; success evidence is emitted after cleanup. The optional CI workflow_dispatch input run_local_browser_rehearsal runs this same isolated tool only when explicitly selected; no hosted workflow execution was performed here, and runner/usage costs require review before triggering it.

Real HTTPS/Secure cross-site browser behavior, Firefox and Safari remain hosted/manual checks. The older UI/measurement scripts remain fixture-based and are not hosted proof. Initial local runs exposed harness-only Tailwind working-directory and label-selection errors; both were corrected before the successful recorded run. The application UI was not redesigned or changed to make the runner pass.

Hosted operator journey after setup:

1. Register disposable vendor and customer through the UI; provision a staging admin explicitly. Confirm database users and cookies without exporting cookie/token values.
2. Vendor completes essential profile/city/coverage and uploads a synthetic portfolio image. Admin rejects with a reason; vendor corrects/resubmits; admin inspects the new revision and approves. Verify public listing/search/category/city/price/pagination and hidden private contacts.
3. Customer opens vendor details, submits a future literal YYYY-MM-DD booking, and sees pending state. Inspect the database and vendor sandbox request email. Vendor accepts; customer sees shared business contacts and a confirmation. Vendor completes; customer receives completion. Inspect outbox status and dashboard links.
4. Create separate requests for rejection and cancellation, verifying the relevant customer/vendor mail and unchanged booking rules. Concurrent acceptance must yield exactly one reservation and409 for losers. Repeat actions must retain409/no duplicate event side effects.
5. Suspend a vendor; public discovery/access must disappear. Restore with review state intact. Deactivate an eligible account/profile and confirm booking eligibility is denied. Test restricted roles/ownership, expired sessions, recovery/OTP, refresh and logout.
6. In actual Chrome/Firefox/Safari, inspect HttpOnly/Secure/SameSite/host/path behavior, cookie refresh/expiry/logout, allowed/untrusted Origin mutations, CORS with credentials, blocked third-party cookies and protected deployment routing. Record browser/platform/version and exact outcomes.

## SMTP and failure verification

Use only the capture inbox or explicitly authorized owned test mailboxes. A sandbox SMTP acceptance is not proof of real inbox delivery or SPF/DKIM/DMARC alignment. For each of booking_requested/accepted/rejected/cancelled/completed, record event/job identity, intended test participant, received subject/time, HTML/plain rendering, dashboard origin and final outbox outcome without publishing recipient addresses or payloads.

Before a hosted worker run: confirm STAGING_EMAIL_MODE=sandbox, the exact host pin/allowlist, empty/synthetic outbox data and a stopped accidental secondary dispatcher. Exercise sandbox failures/retries, expired processing lease, final-attempt terminal visibility, and restart while work is queued. Preserve the existing 120s lease/max 5 claims/backoff/Message-ID limits. A crash between SMTP acceptance and database acknowledgement can still duplicate delivery; never claim exactly-once delivery or replay by changing booking status.

The full backend regression suite provides local evidence for driver transaction retry/rollback, simultaneous acceptance, account-deactivation races, worker lease recovery/fencing, terminal failures, readiness/error sanitization and upload/privacy checks. Hosted network partitions/elections, separate process restart, provider TLS/sender authentication, rollback and alert receipt still require controlled staging execution. Do not turn SMTP failure into an API-readiness dependency.

## Performance evidence and measurement plan

Record infrastructure (service/DB tiers, region, instance counts, runtime/browser versions), dataset size, cache state, workload/concurrency, sample count and p50/p95 for each actual hosted measurement. Do not extrapolate local development-server or tiny synthetic timings into launch capacity.

| Requested measurement | Hosted staging status / required evidence |
| --- | --- |
| Homepage load/Core Web Vitals | PENDING: production build on real staging domain; navigation/LCP/CLS/interaction evidence, viewport/device/network and sample counts; a local navigation sample is not field CWV |
| Vendor search/profile APIs | PENDING: representative category/city/price/pagination data, indexed query plans and latency distribution |
| Booking submission/acceptance | PENDING: bounded disposable-account run, HTTP/commit latency, success/conflict counts and final DB/outbox verification |
| Concurrency | PENDING: configured small workload on staged infrastructure, expected409 conflicts and no duplicate reservations/events |
| Database performance | PENDING: representative explain/metrics, CPU/IO/pool wait/connection headroom; no unredacted profiler payloads |
| Email processing | PENDING: intent-to-claim, SMTP capture/receipt and acknowledgement timestamps, backlog/attempts/provider quota context |

The existing root `scripts/staging-verify.mjs` remains a bounded GET-only hosted smoke/load probe. Require STAGING_API_URL, STAGING_ALLOWED_ORIGIN, STAGING_FRONTEND_ORIGIN and PLANZO_STAGING_CONFIRM=I_UNDERSTAND_THIS_IS_STAGING. Remote names must contain staging; HTTPS/exact-origin guards and redirect refusal remain. Default 20 read-load requests/concurrency 4; maximum 200/concurrency 10/30s. Do not point it at production or treat it as an authenticated write benchmark.

The recorded browser run provides the following **local diagnostic samples only**, on the development frontend/test API, one loopback MongoDB member, synthetic roles and five bookings. These are not staging capacity, percentile benchmarks, production-build CWV or hosted measurements:

| Local operation | Samples / actual result |
| --- | --- |
| Homepage DOMContentLoaded navigation end | 1 navigation, 1753ms; LCP/CLS/INP not measured |
| Vendor search / detail round trip | 1 each, 11ms / 8ms |
| Booking POST round trips | 2 sequential requests, 38ms and 41ms, both 201 |
| Conflicting acceptance PATCH round trips | 2 concurrent requests, 47ms each; one 200 and one 409; pair 49ms |
| Explicit local outbox dispatch | 6 serial batches, 1/1/1/2/3/7 jobs, 36/26/27/47/64/157ms; all 15 accepted by the sink |
| Database query plans / production workload |Not measured; hosted PENDING |

These samples include application/driver/local transport effects and intentionally small workloads. Dispatch was explicitly invoked between journey steps, not measured under the production 5s polling interval or an external SMTP provider.

## Verification matrix and sign-off

PASS means executed/verified evidence. PENDING means a hosted/manual check remains. BLOCKED means release must wait. Prepared configuration is not a deployed/verified service. No item below counts as production verification.

| Check | Local preparation/evidence | Hosted staging | Production |
| --- | --- | --- | --- |
| Dedicated frontend/API/Atlas/worker/sandbox providers | PASS: reviewed configuration/instructions | PENDING | PENDING |
| Database/origin/SMTP pins and recipient/image guards | PASS: focused executable tests | PENDING: inspect provider accounts/permissions and misconfiguration refusal | PENDING |
| Version/topology/indexes/date/schema checks | PASS: synthetic preflight/restore | PENDING: actual staged data | PENDING |
| Backup/restore | PASS: measured synthetic logical copy | PENDING: authorized snapshot/tools/PITR and measured recovery | PENDING |
| Chrome customer/vendor/admin journey | PASS: 22 checks, real local API/DB/UI/cookies | PENDING | PENDING |
| Firefox/Safari, HTTPS/cross-site cookies | PENDING: no supported local execution claimed | PENDING | PENDING |
| Five booking email types | PASS: 15 booking / 17 total local SMTP receipts; MIME/links checked | PENDING: capture/provider authentication/owned mailbox | PENDING |
| Concurrency/transaction rollback/worker leases | PASS: complete local backend regressions | PENDING: hosted interruption/restart | PENDING |
| Hosted DB failover/network interruption | PENDING | PENDING | PENDING |
| Application rollback | PASS: documented procedure | PENDING: execute candidate-to-previous rollback | PENDING |
| Health/error/log privacy | PASS: existing/local regression checks | PENDING: provider routing and log review | PENDING |
| Monitoring/alert receipt | PASS: alert instructions | PENDING: real operator receipt | PENDING |
| Production-volume performance/CWV | PENDING | PENDING | PENDING |
| Release approval | **BLOCKED**: mandatory hosted gates remain | **BLOCKED** for production sign-off | **NO-GO** |

## Exact outstanding actions and rollback

- [ ] Obtain separate authorization for any billable/staging service creation; record project/environment/service identifiers and owners.
- [ ] Create/select isolated Atlas and sandbox accounts, restrict privileges/network, configure exact pins and independent secrets; run staging:check.
- [ ] Build/deploy the same candidate SHA only to staging frontend/API; verify domain certificates, proxy/CORS/cookies and readiness.
- [ ] Complete actual staging preflight/backup restoration/migration rehearsal and save safe reports with timings/failures.
- [ ] Run the operator customer/vendor/admin journeys in the supported browsers and sandbox inbox; verify real Cloudinary test uploads/cleanup.
- [ ] Test controlled DB outage/failover, worker process restart/leases/terminal visibility, candidate rollback and operator alert receipt.
- [ ] Measure representative performance/CWV under bounded staging workload; set limits/alerts from measured capacity.
- [ ] Review all hosted evidence and remaining risks before a separate production release decision. No launch approval is implied by this report.

Rollback drill: record previous/candidate API/frontend SHAs and scoped config snapshots, stop staging mutations/worker when necessary, restore the previous compatible Render/Vercel release, and check health/readiness/preflight/auth/booking/outbox invariants before resuming. Keep additive indexes/fields; source rollback does not undo data, revoke provider messages or reset leases. For data recovery, stop every writer/dispatcher, restore into a fresh isolated target, compare counts/references/indexes and reconcile post-backup reservations/sent jobs before selecting a recovery target. Never drop/overwrite production, reset terminal jobs or rotate credentials automatically. The synthetic restore tool deliberately does not accept an existing target or delete any database.

Existing risks remain explicit: per-process rate limits, copied access JWT lifetime after logout, SMTP duplicate window/outbox retention, Cloudinary orphan cleanup, revisionless legacy clients, query-plan scaling and UTC-vs-browser-local-day boundaries. Additive staging pins reduce accidental crossover but do not replace provider isolation/access reviews. No payments, chat, unrelated redesign, auth rewrite or later phase is included.

## Validation and changed files

| Executed command/check | Exact result |
| --- | --- |
| Complete backend `cd server; npm.cmd test` | **187 passed, 0 failed, 0 skipped**, 203.57s |
| Complete frontend `cd frontend; npm.cmd test -- --maxWorkers=2` | **128 passed across 22 files**, 0 failed, 24.13s |
| Operator scripts `node --test scripts/security-check.test.mjs scripts/staging-verify.test.mjs scripts/staging-browser.test.mjs` | **8 passed, 0 failed, 0 skipped** |
| Backend `npm.cmd run check` | **78 JavaScript files** syntax checked |
| Production frontend build with APP_ENV=staging / explicit HTTPS placeholder VITE_API_URL | **PASS**, 2,140 modules, 9.27s |
| Backend/frontend `npm.cmd audit --audit-level=high` | **0 vulnerabilities in both** |
| Synthetic restore | **PASS**, measured evidence linked above; 3 new backend tests |
| Local Chrome real-stack rehearsal | **22/22 PASS**, exit 0 after cleanup; evidence linked above |
| Secret scan `node scripts/security-check.mjs --all-files --history` | **0 findings**, 204 current text files and 116 local commits |
| `git -c core.safecrlf=false diff --check` | **PASS** |

Eight new backend staging-isolation tests plus three synthetic-restore tests bring the backend suite from 176 to 187. One new frontend staging-build test brings 127 to 128; three new browser/operator tests bring 5 to 8. No existing test was deleted and no new dependency was added. Existing Phase 1.1–1.4 reservation, moderation, authentication and outbox regressions pass.

Initial filesystem/browser sandbox restrictions required permitted execution outside that restriction. Known MongoMemoryServer Windows ECONNRESET shutdown diagnostics occurred, while assertions/process exit passed. Browser success is collected only after exit 0, complete checks and cleanup; no failed partial run was stored as PASS. GitHub-hosted CI, Atlas/provider/browser verification and production release remain unexecuted.

The following **35 files** changed in Phase 1.5:

| Purpose | Files |
| --- | --- |
| Deployment/CI | [.github/workflows/ci.yml](../.github/workflows/ci.yml), [deploy/render.staging.yaml.example](../deploy/render.staging.yaml.example), [deploy/render.staging-cron.yaml.example](../deploy/render.staging-cron.yaml.example) |
| Documentation/evidence | [README.md](../README.md), [server/README.md](../server/README.md), [docs/MVP_MIGRATION.md](MVP_MIGRATION.md), this report, [restore evidence](evidence/phase-1-5-restore.json), [browser evidence](evidence/phase-1-5-browser.json) |
| Frontend build safeguards | [frontend/.env.example](../frontend/.env.example), [frontend/scripts/public-env.mjs](../frontend/scripts/public-env.mjs), [frontend/src/test/frontendEnvironment.test.js](../frontend/src/test/frontendEnvironment.test.js), [frontend/vite.config.js](../frontend/vite.config.js) |
| Runtime isolation | [server/.env.example](../server/.env.example), [server/admin.js](../server/admin.js), [server/src/app.js](../server/src/app.js), [server/src/config/database.js](../server/src/config/database.js), [server/src/config/environment.js](../server/src/config/environment.js), [server/src/config/cloudinary.js](../server/src/config/cloudinary.js), [server/src/config/stagingSafety.js](../server/src/config/stagingSafety.js), [server/src/controllers/vendorController.js](../server/src/controllers/vendorController.js), [server/src/middleware/upload.js](../server/src/middleware/upload.js), [server/src/services/accountEmailService.js](../server/src/services/accountEmailService.js), [server/src/services/otpEmailService.js](../server/src/services/otpEmailService.js), [server/src/services/bookingEmailService.js](../server/src/services/bookingEmailService.js) |
| Rehearsal commands | [server/package.json](../server/package.json), [server/scripts/checkStagingEnvironment.js](../server/scripts/checkStagingEnvironment.js), [server/scripts/rehearseStagingRestore.js](../server/scripts/rehearseStagingRestore.js), [server/scripts/localBrowserRehearsal.js](../server/scripts/localBrowserRehearsal.js), [server/scripts/localSmtpCapture.js](../server/scripts/localSmtpCapture.js) |
| Browser/operator automation | [scripts/staging-browser-cdp.mjs](../scripts/staging-browser-cdp.mjs), [scripts/staging-browser-journey.mjs](../scripts/staging-browser-journey.mjs), [scripts/staging-browser.test.mjs](../scripts/staging-browser.test.mjs) |
| Backend tests | [server/test/stagingSafety.test.js](../server/test/stagingSafety.test.js), [server/test/stagingRestore.test.js](../server/test/stagingRestore.test.js) |

## Sources and Community Wisdom

### 🌐 Community Wisdom: [How a $150,000 Mistake Changed the Way I Handle Production Data](https://dev.to/ihorklymchuk/how-a-150000-mistake-changed-the-way-i-handle-production-data-j2b)
> **Source**: [Ihor Klymchuk](https://dev.to/ihorklymchuk)
> **Tags**: `startup`, `opensource`, `devops`, `datasecurity`
>
> The author's firsthand account describes restored production data interacting with active staging jobs and external services. This is one incident account, not a failure-rate estimate or broad consensus, and its inspected discussion had no comments. It supports using synthetic data, paused dispatchers and separate sandbox credentials here; configuration pins alone are not sufficient. DevRelay tools were unavailable, so the public article and primary provider documentation were consulted directly.
>
> 🔗 [Read Full Discussion](https://dev.to/ihorklymchuk/how-a-150000-mistake-changed-the-way-i-handle-production-data-j2b)

A DEV draft/session export can be prepared separately if requested; nothing was published or exported. Stop after Phase 1.5 preparation and the local checks actually verified.
