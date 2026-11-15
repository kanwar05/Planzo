# Repository cleanup

## Scope and baseline

This cleanup preserves the MERN application, public routes and response shapes,
database schemas, authentication, booking rules and durable email outbox.
No commit, push, production database operation or hosted deployment is part of it.

The starting branch was `refresh-planzo` at `39b0477`. The working tree already
contained category changes in `frontend/src/data/services.js`,
`frontend/src/pages/ServicesPage.jsx`, `server/src/models/Vendor.js`,
`server/test/vendorOnboarding.test.js`, and the new
`frontend/src/pages/ServiceCategories.test.jsx`. Those files are left intact.
Eight historical documents were already deleted by the user: `BOOKING_PHASE_1_1.md`,
`BOOKING_PHASE_1_2.md`, `MVP_MIGRATION.md`, `MVP_REFACTOR.md`,
`PRODUCTION_PHASE_1_4.md`, `Planzo_Email_OTP_Backend_Explanation.md`,
`UI_REDESIGN.md`, and `VENDOR_PHASE_1_3.md`. Their removal is not cleanup performed
here, and those files are not restored.

## Inspection and execution plan

1. Inspect tracked and untracked paths, manifests, lockfiles, frontend/backend
   modules, tests, CI, deployment configuration, scripts and documentation.
2. Follow static and literal dynamic imports, React lazy routes, runtime model
   loading, CSS/public asset references and package/CI entry points. Check all
   local Git references and relevant history before declaring something unused.
3. Run baseline frontend/backend and operational tests, backend syntax checks and
   the repository/history secret scanner. Tests use isolated MongoDB instances.
4. Apply only the confirmed deletions below. Keep ambiguous files and all
   operational entry points, environment files/templates, data and font licenses.
5. Move the email dispatcher into `server/src/workers/` and extract shared booking
   population/serialization into `server/src/services/bookingViewService.js`.
   Keep transaction code, contact-sharing rules and worker policy unchanged.
6. Share the repeated frontend dashboard destination helper; remove the unused
   icon import. Correct the stale build-configuration test and comments to match
   the existing Vercel observability allowlist.
7. Give the empty root package private orchestration scripts, update documentation
   links and document current operations without recreating retired phase guides.
8. Run applicable checks, tests, a production frontend build and dependency
   audits; inspect the final diff and verify preserved files against their
   initial hashes. Record hosted integration limits explicitly.

The baseline dependency audit also found Mongoose 8.24.5 affected by current
security advisories. Apply the maintainer's patched 8.24.7 release within the
existing 8.x line, without changing schemas, and rerun the full backend suite.
See the [maintainer advisory](https://github.com/Automattic/mongoose/security/advisories/GHSA-8332-j7wj-wjw4).

## Deletion classification

| Candidate | Classification | Evidence / decision |
| --- | --- | --- |
| `server` dependency `morgan` | Confirmed unused | No runtime import; history shows it was replaced by the structured `requestLogging` middleware. Remove manifest entry and unused lockfile graph. |
| `frontend` devDependency `@testing-library/user-event` | Confirmed unused | No imports or script usage; current interaction tests use Testing Library's `fireEvent`. Remove direct development dependency and unused lockfile node. |
| `server/src/utils/validation.js`: `toNonNegativeNumber` | Confirmed unused | Declaration only across source/tests/scripts; prior callers belong to historical implementations. Remove helper only. |
| `frontend/src/pages/HomePage.jsx`: `ArrowDown` import | Confirmed unused | Import binding has no use, including JSX. Remove import specifier only. |
| `frontend/src/assets/optimized/catering-small.webp` | Confirmed unused | No source, CSS, HTML, script, dynamic import or Git source-reference match. Current catering uses the tablescape image pair. Remove generated thumbnail. |
| `frontend/src/assets/optimized/decoration-small.webp` | Confirmed unused | Same reference checks; current decoration uses the corporate gala image pair. Remove generated thumbnail. |
| `frontend/src/assets/optimized/dj-small.webp` | Confirmed unused | Same reference checks; current DJ uses the Mohali image pair. Remove generated thumbnail. |
| Original JPG/PNG artwork in `frontend/src/assets/` and `assets/services/` | Uncertain | Not runtime-imported, but may be editable source material. Retain for owner review. |
| `frontend/src/services/authService.js`: `refresh`; legacy `PHONE_AUTH_FAILED` branches; token compatibility exports | Uncertain | No current direct consumers found for some exports, but authentication compatibility deserves separate review. Retain. |
| `.glass` CSS and Tailwind `hero-glow` background | Uncertain | No current reference found; styling hooks may be used outside tracked templates. Retain. |
| All server models | Required | Startup dynamically loads the eight models; indexes and relationships also depend on them. Retain. |
| Frontend pages/layouts/hooks/components | Required | Every module is imported, including lazy routes, auth service loading and motion features. Retain. |
| All CLI/QA/security/staging scripts | Required | Invoked by npm/CI or intentionally run manually. Retain, including browser scripts without npm entries. |
| Environment templates/files, CI, Vercel config, font licenses, tests, locks | Required | Operational, legal, reproducibility or regression purpose. Retain; actual environment contents are not printed or edited. |

The old dispatcher path disappears because of a move, not dead-code deletion.
No other whole source files or dependencies were established as unused.

## Structure before cleanup

Ignored dependencies, caches, actual environment files and build outputs are
omitted from both trees. `docs/` had already been removed in the working tree.

```text
Planzo/
|-- .github/workflows/ci.yml
|-- .gitignore, .nvmrc, package.json (empty), package-lock.json, README.md
|-- scripts/{security-check,staging-verify}{,.test}.mjs
|-- frontend/
|   |-- .env.example, package*.json, index.html, *config.js, vercel.json
|   |-- public/{favicon.svg,fonts/}
|   |-- scripts/{public-env,verify-ui,measure-ui}.mjs
|   `-- src/
|       |-- assets/{optimized/,services/}
|       |-- components/dashboard/, context/, data/, hooks/, layouts/
|       `-- pages/, routes/, services/, test/, utils/
`-- server/
    |-- .env.example, package*.json, README.md, server.js, admin.js
    |-- scripts/, test/
    `-- src/
        |-- config/, controllers/, middleware/, models/, routes/
        |-- services/bookingEmailDispatcher.js (alongside other services)
        `-- utils/
```

## Results

### Structure after cleanup

The existing frontend and backend layers remain. No empty feature, validator or
controller directories were created just to satisfy a template.

```text
Planzo/
|-- .github/workflows/ci.yml
|-- .gitignore, .nvmrc, package.json (private commands), package-lock.json
|-- README.md
|-- docs/{CLEANUP,OPERATIONS}.md
|-- scripts/{security-check,staging-verify}{,.test}.mjs
|-- frontend/
|   |-- .env.example, package*.json, index.html, *config.js, vercel.json
|   |-- public/{favicon.svg,fonts/}
|   |-- scripts/{public-env,verify-ui,measure-ui}.mjs
|   `-- src/
|       |-- assets/{optimized/,services/} (3 unused thumbnails removed)
|       |-- components/dashboard/, context/, data/, hooks/, layouts/
|       |-- pages/, routes/, services/, test/
|       `-- utils/ (including navigation.js)
`-- server/
    |-- .env.example, package*.json, README.md, server.js, admin.js
    |-- scripts/, test/
    `-- src/
        |-- config/, controllers/, middleware/, models/, routes/
        |-- services/ (including bookingViewService.js)
        |-- utils/
        `-- workers/bookingEmailDispatcher.js
```

### Files deleted

Only the following three files were removed as unnecessary. They total 55,028
bytes and were not part of the application bundle before cleanup, so this is a
repository-size reduction rather than a claimed runtime performance improvement.

| File | Why unnecessary |
| --- | --- |
| `frontend/src/assets/optimized/catering-small.webp` | Unreferenced generated variant; current category uses the tablescape image pair. |
| `frontend/src/assets/optimized/decoration-small.webp` | Unreferenced generated variant; current category uses the corporate gala image pair. |
| `frontend/src/assets/optimized/dj-small.webp` | Unreferenced generated variant; current category uses the Mohali image pair. |

The removed old `server/src/services/bookingEmailDispatcher.js` path is a move:
its implementation remains under `workers/`. The eight pre-existing document
deletions remain the user's changes and are not included in this removal count.

### Files moved or refactored

| Paths | Change |
| --- | --- |
| `server/src/services/bookingEmailDispatcher.js` -> `server/src/workers/bookingEmailDispatcher.js` | Move worker implementation; only its email-service import changes. |
| `server/scripts/dispatchBookingEmails.js`, `server/src/utils/outboxDiagnostics.js`, `server/test/bookingEmailDispatcher.test.js` | Point existing entry points/diagnostics/tests to the moved worker. CLI paths and npm commands stay compatible. |
| `server/src/services/bookingViewService.js`, `server/src/controllers/bookingController.js`, `server/src/controllers/adminController.js` | Extract shared booking population/serialization verbatim into a service. Preserve allowlists, identity checks and contact-sharing decisions. |
| `server/src/utils/validation.js` | Remove only unused `toNonNegativeNumber`. |
| `server/src/config/database.js`, `server/src/utils/bookingDataAudit.js` | Update broken operational guidance paths; error codes and guards remain unchanged. |
| `frontend/src/utils/navigation.js`, `frontend/src/components/Navbar.jsx`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/routes/AppRoutes.jsx`, `frontend/src/pages/LoginPage.jsx` | Centralize identical role-to-dashboard mapping. Preserve saved login destination and customer fallback. |
| `frontend/src/pages/HomePage.jsx` | Remove only unused `ArrowDown` import. |
| `frontend/scripts/public-env.mjs`, `frontend/src/test/frontendEnvironment.test.js` | Correct comment and stale expectation to match the existing diagnostic/allowlist; add Vercel observability coverage. Validator behavior remains unchanged. |
| `frontend/src/components/ProtectedRoute.test.jsx`, `frontend/src/pages/AuthPages.test.jsx` | Exercise all role destinations and saved login pathname. |
| Root `package.json`, `package-lock.json` | Replace empty manifest with private, dependency-free verification/build commands. Keep separate subproject locks; no workspaces added. |
| `frontend/package.json`, `frontend/package-lock.json`, `server/package.json`, `server/package-lock.json` | Remove two unused direct dependencies and apply the security patch below. |
| `README.md`, `server/README.md`, `docs/OPERATIONS.md`, `docs/CLEANUP.md` | Current structure, commands, operations, evidence, and manual-review record; replace broken links without restoring retired documents. |

### Dependency changes

- Removed server runtime dependency `morgan`; npm also pruned its now-unneeded
  `basic-auth`, nested `safe-buffer@5.1.2`, and `on-headers` entries. Other
  dependencies' required versions of shared packages remain.
- Removed frontend development dependency `@testing-library/user-event`.
- Updated installed Mongoose `8.24.5` -> `8.24.7`; manifest minimum is now
  `^8.24.7`. Its required `mquery` dependency changed `5.0.0` -> `5.0.1`.
  No other dependency versions changed and no new direct dependencies were added.
- Final lockfiles and installed versions match. Both final npm audits reported
  zero known vulnerabilities at verification time.

### Verification performed

Checks ran on Windows with Node `v24.21.0` and npm `12.1.0`. The repository's
`.nvmrc`/CI selects Node 22; Node 22 was not separately executed locally.

| Check | Baseline | Final result |
| --- | --- | --- |
| Backend tests (`npm --prefix server test`) | 183 passed | 183 passed; no failures/skips. Includes concurrency, authentication, outbox recovery/rollback, uploads, moderation, onboarding and startup regressions. |
| Frontend tests (`npm --prefix frontend test -- --reporter=dot`) | 142 passed, 1 failed | 149 passed across 23 files. The baseline failure expected a retired build-validation error string; the test now checks the existing named-variable diagnostic without exposing values. |
| Operational-script tests (`npm run test:operations`) | 5 passed | 5 passed. |
| Backend syntax (`npm run check`) | 71 JS files | 72 JS files passed. This includes the new worker directory automatically. |
| Frontend import audit | Audited before cleanup | 92 JS/JSX/MJS files parsed; 318 relative imports resolved, including 24 dynamic imports; zero unresolved references or unused import bindings. All CSS font URLs resolve. |
| Production frontend build | Not separately run | Passed with explicit `VITE_API_URL=https://staging-api.example.invalid/api`; placeholder endpoint, no hosted API contacted. |
| npm dependency audits | Frontend clean; backend Mongoose high severity | Both projects: zero known vulnerabilities. |
| Working-tree and local Git-history secret scan | 184 text files; no findings | 188 text files; no findings. This is the existing scanner's rule set, not a guarantee that every possible secret format is recognized. |
| Git diff review / whitespace | Existing changes recorded | `git diff --check` passed; only expected cleanup and initial user changes present. |
| Existing edits | Five file hashes recorded | All five source/test files match their starting SHA-256 hashes. Eight initial documentation deletions remain. |
| Lint | No ESLint configuration/script | No lint result claimed. Backend syntax checks, frontend transform/build, tests and import review were performed. |

The final frontend test/build initially encountered an esbuild directory-read
denial in the sandbox; both completed successfully with the required escalated
execution. Registry metadata verification likewise passed after its sandbox
restriction was resolved. Backend MongoMemoryServer shutdown emitted
`ECONNRESET` diagnostics in baseline and final runs; both full runs exited zero
with every test passing. That test-harness noise remains for separate review.

### Remaining technical debt and manual review

Retain the following original bitmap assets until their design-source role is
confirmed. They have no current runtime imports; absence of an import alone does
not establish that original artwork is disposable:

```text
frontend/src/assets/
  homepage-cocktail-event.jpg
  homepage-concert-night.jpg
  homepage-gala-hall.jpg
  homepage-mandap.jpg
  homepage-sikh-wedding.jpg
  homepage-wedding-dining.jpg
  planzo-hero-event.jpg
  planzo-hero.png
  services/
    catering.jpg
    chandigarh_private_celebration.jpg
    corporate_brand_gala_1788675512204.jpg
    decoration.jpg
    dj.jpg
    editorial_hero_event_1788675428596.jpg
    event_build_day.jpg
    indian_woman_chef.jpg
    indian_woman_event_producer.jpg
    luxury_wedding_editorial_1788675454322.jpg
    mehndi-artist.jpg
    mehndi.jpg
    mohali_dj_night.jpg
    planner.jpg
    punjab_heritage_venue.jpg
    rental.jpg
    tablescape_details_macro_1788675492844.jpg
    venue.jpg
```

Other review items:

- Keep unused-looking authentication compatibility exports/branches in
  `frontend/src/services/authService.js`, `frontend/src/services/api.js`,
  `server/src/utils/generateToken.js` and `server/src/middleware/errorMiddleware.js`.
  Review compatibility before removal. Actual refresh behavior remains in the
  Axios interceptor and backend routes.
- Keep `.glass` in `frontend/src/index.css` and `hero-glow` in
  `frontend/tailwind.config.js`; no tracked use was found, but external styling
  consumers are uncertain.
- Large `authController.js` and `VendorProfilePage.jsx`, repeated admin-page
  loading guards and duplicated browser QA infrastructure deserve focused future
  refactors with their own regression scope. Different OTP/account/booking SMTP
  transport policies were deliberately retained.
- Browser QA scripts require Chrome, fixed local ports and fixtures dated in
  2027; neither browser script was executed for this cleanup. Native dialog and
  custom modal-focus handling serve different components and were retained.
- Rate-limit stores are per API process. Multi-instance deployment, a supported
  MongoDB release/topology, worker supervision and provider capacity remain
  deployment responsibilities.
- Admin provisioning password validation differs from the normal login path's
  bcrypt byte limit; resolve in a separately scoped behavior/security change.
- SMTP acceptance before outbox acknowledgement can produce duplicates after a
  crash. Cloudinary cleanup outages can leave orphaned provider assets. Existing
  recovery semantics and operator responsibilities remain unchanged.
- The DevRelay Community Wisdom connector was unavailable, so no community
  research claims or event matches are asserted. Decisions here use source,
  Git-history, maintainer-advisory and local regression evidence.

### Behavior preservation and verification limits

No cleanup edits changed schemas, public API paths/response contracts,
authentication flows, booking transition rules, transaction/retry guards,
reservation indexes, outbox enqueueing or worker lease/retry policy. The
serialization extraction and dispatcher move were compared against the original
implementation; local regression coverage passed after the dependency patch.
Only operator-facing diagnostic documentation paths changed.

User data, actual environment files, secrets, uploaded assets, Git history,
deployment configuration and unrelated initial changes were not edited or
deleted. No commit, push, database repair, live worker dispatch or provisioning
command was performed.

Hosted MongoDB/SMTP/Cloudinary, real browser/proxy/cross-site-cookie behavior,
backup restoration, failover, production load and deployed integrations were not
tested. Local fixture/socket tests and the successful production build do not
establish production verification. See `OPERATIONS.md` for the remaining staging
and release evidence.
