# Planzo UI redesign

## Audit and scope

The existing application is a React 18 / Vite 6 / Tailwind 3 marketplace with React Router, Axios, cookie authentication, and an Express/Mongoose API. The frontend originally loaded every route eagerly. Its mobile homepage had a 680px image hero, search exposed every filter at once, and customer navigation lacked a persistent mobile bar. Shared components used heavy shadows, plum/coral colors, inconsistent muted-text contrast, and large desktop spacing on phones.

The implementation retains all existing route URLs, API service contracts, authentication roles, booking states, cancellation rules, availability handling, upload fields, and business contact visibility. Existing backend working-tree changes were present before this task and were not edited by the redesign.

The current README and API confirm that favorites, reviews, payments, refunds, chat/Socket.IO, and notification feeds had already been removed from this checkout. These integrations were not fabricated or reintroduced. The customer navigation therefore uses **Home / Explore / Services / Bookings / Profile**. Search supports the actual backend fields: service/name, category, city, minimum price, and maximum price. Every public result is already an approved vendor; unsupported rating, availability-search, and sort controls are omitted.

The work followed the requested sequence: repository audit, shared visual foundation, customer discovery/profile, booking/account, vendor/admin workspaces, then accessibility, performance, and regression verification.

## Design direction

All six supplied Pinterest image URLs were inaccessible through the reference browser. No observations about those images are claimed. The brief's fallback direction informed the design: warm ivory, dark ink, terracotta, sage, editorial typography, image-led service discovery, and quieter rounded surfaces.

Manrope handles interface text; DM Serif Display handles expressive headings. Both are served locally as WOFF2 files with their SIL Open Font Licenses. The palette uses `#FAF8F5` background, `#24201F` foreground, `#F1EDE8` surfaces, `#DCE8DC` sage, and the darker `#A94F39` terracotta for readable accent controls. Semantic CSS tokens cover background, surface, muted text, border, success, warning, danger, and focus.

## Implemented screens and components

| Area | Changes |
| --- | --- |
| Shared foundation | Typography, semantic tokens, buttons, cards, headings, skeletons, empty states, toast accessibility, favicon, skip links, visible focus, safe-area spacing, reduced-motion support |
| Homepage and services | Compact mobile search, editorial desktop composition, swipeable photographic categories, genuine API vendor results and city links, meaningful retry/empty states, how-it-works and partner registration |
| Discovery | URL-backed category/city/price search, removable filter chips, reset/retry, responsive cards and pagination, keyboard-accessible mobile filter sheet |
| Vendor profile | Real portfolio gallery with swipe and arrow navigation, fullscreen focus-managed preview, collapsible sections, real availability, desktop booking panel, safe-area mobile booking control above bottom navigation |
| Booking | Three recoverable steps (event, brief, review), native date input, unavailable-date checks, per-step validation, real submission, duplicate-submit guard, failure focus, protection from stale requests when vendor routes change |
| Customer account | Booking status filters, readable cards, eligible cancellation, status reasons, intended business contacts only after acceptance, account/password/email/deactivation forms |
| Authentication | Matching login, customer/vendor signup, recovery/reset/email confirmation; vendor links preselect the vendor signup role without allowing administrator signup |
| Vendor workspace | Requests and status actions, real booking metrics, unavailable/booked dates, business profile and private contact editing, portfolio upload/removal confirmation |
| Admin workspace | Real platform counts, user suspension/reinstatement and reasons, vendor approval/rejection, booking filtering and cancellation confirmation, responsive record cards |
| Navigation | Role-specific workspace navigation, mobile drawer with focus isolation, persistent customer navigation, hidden navigation during booking and virtual-keyboard interactions |

Modal focus management isolates background content, traps keyboard focus, closes on Escape, and restores previous focus and scroll state. Native dialogs provide the same behavior for destructive confirmations. All customer-facing listings use actual API data; fallback images are labeled as category inspiration. No ratings, reviews, testimonials, prices, cities, or bookings were invented.

## Dependencies and performance work

- Replaced the direct `framer-motion` dependency with maintained `motion` (`motion/react` imports). Global `MotionConfig` respects user reduced-motion preferences; filter chips, gallery overlays, card feedback, and mobile navigation use restrained transitions. See the [Motion accessibility documentation](https://motion.dev/docs/react-accessibility).
- Kept React, Vite, Tailwind, routing, and backend architecture. GSAP, Lenis, Radix, and additional state libraries were unnecessary for these interactions.
- Lazy-loaded secondary routes and account/dashboard layouts with visible loading and recoverable application error states.
- Deferred the animation feature bundle with `LazyMotion` and `motion/react-m`; the headline renders immediately and optional animation failures leave content and controls usable. Route entrances use a brief fade, and hero entrances use transforms without hiding the main content. See [Motion's lazy-loading guidance](https://motion.dev/docs/react-lazy-motion).
- Loaded API services after the initial public page render, retaining cookie-based authentication and the existing service contracts. Protected routes announce their account-loading state.
- Self-hosted three font files, approximately 74KB total; removed third-party font requests.
- Created 320px and 960px WebP derivatives from existing photographs. Category thumbnails are approximately 13–26KB. The original 2.9MB Mehndi photo now has a 12.8KB thumbnail and 60.4KB service-page image.
- Added responsive source sets, dimensions, below-fold lazy loading, and a desktop-only hero image source. Replaced the 2MB generic fallback with a much smaller existing event image.
- Final initial JavaScript bundle: approximately 277KB uncompressed / 91KB gzip, down from 439KB / 144KB before the resumed optimization pass (37% less initial JavaScript). CSS: approximately 48KB / 9.9KB gzip. API, animation, and secondary route chunks load separately.

## Resumed implementation polish

- Preserved typed searches when changing service categories; dismissing an unapplied filter sheet keeps the search text while discarding its unsubmitted advanced filters.
- Improved mobile keyboard detection for both layout and visual viewport resizing, initial open keyboards, pinch zoom, and browsers without VisualViewport support. Navigation remains hidden through keyboard dismissal instead of briefly overlapping it.
- Prevented old admin directory requests from replacing newer filter results; disabled conflicting filters during account, booking, and verification mutations.
- Added a retry action when loading the vendor's business profile fails; save and upload failures appear beside the relevant actions while preserving entered values.
- Added focused session tests covering cookie-based identity, session expiry, failed logout recovery, and registration after deferred service loading.

## Verification

| Check | Result |
| --- | --- |
| Original frontend baseline | 32 tests passed |
| Final frontend regression suite | 93 tests passed across 20 files |
| Vite production build | Passed |
| Backend syntax check | 41 JavaScript files passed |
| Backend isolated regression suite | 50 tests passed using installed MongoDB 9.0.2 in temporary databases |
| Responsive browser checks | 19 routes × 8 widths = 152 route/viewport checks; no page overflow, missing primary headings, placeholder links, or runtime exceptions |
| Browser interactions | 75 checks passed: role navigation, filter focus/Escape, gallery arrow keys/focus restoration, and booking CTA positioning |
| Failed optional animation download | 19 mobile routes and 11 interaction checks passed with the animation chunk deliberately blocked |
| Production dependency audit | Zero reported vulnerabilities (`npm audit --omit=dev`) |

Browser widths: **320, 360, 375, 390, 430, 768, 1024, 1440**. Browser checks intercept API requests with explicit fixtures; they never mutate live accounts or bookings. They complement the real isolated backend tests rather than proving a live deployment's configuration.

Screenshots and machine-readable results are under `frontend/.cache/redesign/`. Key screenshots include `after---320.png`, `after---390.png`, `after---1440.png`, `after--vendors-vendor-1-320.png`, `after--booking-vendor-1-320.png`, and `after--admin-1440.png`. Earlier workspace baseline screenshots remain in `frontend/.cache/`.

### Mobile lab measurements

Three homepage runs used Chrome at 390×844, 4× CPU slowdown, 150ms latency, 1.6Mbps download throughput, disabled cache, local uncompressed HTTP, and isolated API fixtures:

| Metric | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| LCP | 2.744s | 2.520s | 2.480s |
| Observed CLS | 0.00030 | 0.00030 | 0.00030 |
| Maximum sampled interaction duration | 56ms | 32ms | 40ms |

Before the resumed pass, LCP was 3.448s / 3.296s / 3.544s under the same conditions. The latest median is 2.520s, about 27% lower than the earlier median. The main headline is the measured LCP element. These are direct lab observations, not Lighthouse scores or field INP. **The 2.5s LCP goal is not consistently reached** in this uncompressed local test. Production compression/caching, real API latency, devices, and field measurements still need evaluation. The measurement report records its exact conditions, LCP element, and resource timings in `performance-results.json`.

## Reproduce

```powershell
cd frontend
npm.cmd test
npm.cmd run build
node scripts/verify-ui.mjs
node scripts/measure-ui.mjs
```

The browser scripts use installed Chrome (Windows default); set `CHROME_PATH` for another installation. They own local ports 4174 and 9336 and must run sequentially. Set `QA_WIDTHS` to a comma-separated subset for targeted viewport checks. Outputs are ignored local artifacts in `.cache/redesign`.

Set `QA_BLOCK_ANIMATIONS=1` with `QA_WIDTHS=390` to repeat the optional-download failure check. Its results are written separately to `browser-no-animation-results.json`.

Backend tests can use an installed MongoDB executable through `MONGOMS_SYSTEM_BINARY` and matching `MONGOMS_VERSION`, as documented in the project README. The redesign did not change backend test configuration.

## Remaining limitations

- Native iOS Safari and physical Android devices were not available; Chromium responsive emulation and focused keyboard tests do not replace device QA.
- Live SMTP delivery, Cloudinary uploads, production credentials, and deployment configuration were not exercised. API contracts and isolated tests remain intact.
- Production LCP and field INP require deployed measurements; the local median LCP remains slightly above target.
- The full development dependency audit reports 10 advisories (3 moderate, 5 high, 2 critical), confined to Tailwind/Vitest tooling and transitive dependencies. Proposed fixes require major Tailwind/Vitest upgrades; those were left outside this design change as the brief explicitly discourages forced major migrations.
- DevRelay community research tools were unavailable in this session, so no community evidence or event claims are invented.
- No deployment or real customer data mutation was performed.
