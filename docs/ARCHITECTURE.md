# Architecture

## Overview
A modular monolith in one Next.js App Router application. Layers depend downward only:

```
src/app (routes)  →  src/features/* (domain)  →  src/lib (db, utilities)  →  external (Postgres, sources)
        ↘ src/components (shared UI, no domain logic)
```

## Folder structure
```
src/
  app/                 Routes, layouts, route handlers. Thin: fetch via feature services, render.
  components/
    ui/                Design-system primitives (Button, Input, Badge, SourceLabel…)
    layout/            Container, SiteHeader, SiteFooter
    marketing/         Landing-page sections (Phase 1)
  features/
    colleges/          discovery, profiles
    cutoffs/           cutoff explorer, rank/fee formatting
    rank-predictor/    rank-based discovery (historical matching only)
    counselling/       counselling schedules and rounds
    reviews/           resident experiences
    announcements/     announcement directory
    student-profile/   accounts, saved colleges (Phase 7)
  lib/                 db client, cn, cross-feature utilities
  types/               cross-feature types (provenance)
  config/              site config, navigation
prisma/                schema and migrations
e2e/                   Playwright tests
```

Inside a feature, create these only when needed:
```
features/<name>/
  components/   feature UI
  services/     data access (server-only), the only place that calls `db`
  hooks/        client hooks
  lib/          pure domain logic (unit tested)
  validations/  Zod schemas
  types.ts
```
Features may import from `components`, `lib`, `types` and `config`. A feature imports another feature only through that feature's `services` or `lib`, never its components.

## Routing conventions
- Public routes are `/` (landing), `/privacy`, `/login`, `/signup` and `/account`.
- **Decide** (`src/features/decide`, `src/app/decide`): `/decide` (overview), `/decide/options` (`q`, `reach`, `closed`, `prov`, `page`), `/decide/choices`, `/decide/compare?ids=`, `/decide/rank-scan` (`scan`, `year`, `w` = 100 | 250 | 500, default 250), `/decide/last-ranks` (`course`, `lcat`, `lquota`, `inst`, `since` "from year", `sort`, `dir`, `page`; with `inst` and no `page` the page holding that institute's row opens), `/decide/seats` (`tab=matrix|trends`; seat lists: `list` (a seat list key, default the newest clear vacancy), her profile params `sp`, `deg`, `c`, `quota`, `st` as filters (no quota ticked = the open quotas, as on Options), `scat` seat category, `inst` + `course` + `squota` for one option, `nohist=1` only seats with no Options row (no past allotments), `q`, `sort=college|state|seats`, `page`), `/decide/institutes` (`q`, `state`, `course`, `sort`, `page`), `/decide/institutes/[slug]` (`tab=overview|courses|allotments|fees|clinical`; the Allotments tab also takes `year`, `course`, `page`, 50 per page), `/decide/allotments` (`inst`, `course`, `year`, `round`, `aq` quota, `acat` seat category, `state`, `from`, `to`, `page`; an unknown `inst` is a 404), `/decide/fees` (one row per institute × programme it offers: `program` = mdms | diploma | dnb | nbems-diploma | mch | mph | all, `state` (a state or all), `q`, `maxfee` ₹ lakh or any, `minstip` ₹/month, `bondyrs` or any, `maxbond` ₹ lakh, `bdecl` = declared | none, `nd` = hide | keep (the "Include colleges that haven't declared it" checkbox: hide = unticked, values not declared fail the caps), `sort` = fee1 | feetotal | stip1 | bondyrs | bond | leave | name, `dir`, `page`; absent programme, state, fee and bond-year filters default to her profile's, all/any clear them) and `/decide/counselling` (`tab=schedule|announcements|merit`). Sub-navigation uses links with `aria-current`, not ARIA tabs. The sidebar has 12 items in Plan, Counselling and Research groups (Counselling above Research, so the round schedule shows without scrolling the sidebar); on mobile there is a bottom bar with Options, Choices and Rank scan. `decide/not-found.tsx` and `decide/error.tsx` render inside the Decide shell.
- Filter and search state lives in URL search params, so it can be shared and works with the back button. Parse params with Zod in `page.tsx` (`parseSearchParams(schema, params, lists)` in `features/decide/lib/params.ts`: a bad field falls back, ranks accept "30,000"). Filter forms are GET forms (`next/form`, `FilterBar`). A page's own filters never reuse a profile key (hence `aq`, `acat`, `lcat`, `lquota`), or they would leak into her profile on the next link.
- Every link between Decide screens comes from `decideLinks(params)` (`features/decide/lib/links.ts`; `useDecideLinks()` in client components). It keeps the profile params, with repeated values kept (`sp=A&sp=B` becomes `sp=A,B`); `L.with(path, changes)` keeps the page's filters too, `L.page(path, n)` changes the page.
- Lists are paginated on the server (`page`, 25–50 rows): service list functions take an optional `{ page, pageSize }` and return `{ rows, total, page, pageSize }`; pages render `Pager`, never a whole table. Options is the exception: 25 server-rendered rows plus a client "Show N more" that appends the next page from `/api/v1/options` and moves focus to the first new row (`page` is still honoured).
- **Profile in the URL:** the Decide profile (rank, category, PwD, specialties, degrees, optional exact courses `pairs`, quotas, states, max fee and max bond) is saved in localStorage under `medpath.profile` and mirrored into URL params (`rank`, `cat`, `pwd`, `sp`, `deg`, `c`, `quota`, `st`, `fee`, `bond`; list params repeated or comma-joined). `c` holds exact courses as `degree~SPECIALTY` (`c=DNB~FAMILYMEDICINE`); when present they replace specialties x degrees (which then only name her specialties), so "DNB Family Medicine only" can be said. Every course filter goes through `profileHasCourse(profile, { degree, specialty })` (SQL readers: `profileCourseFilter`, listSeats `pairs`); Options and Seats show one exact-course filter (`c`) instead of Course and Degree when the profile has pairs. The dialog ticks degrees per specialty and saves the old form when it can (`coursesFromPicks`), so profiles without pairs are unchanged. URL params override the saved profile. Every localStorage value is Zod-validated on read (choice lists item by item, so one bad entry never costs the rest). `DecideShell` adds the saved profile to the URL when it's missing and carries the params on every sub-nav link, so all Decide pages are server-rendered from the URL. Choice lists (`medpath.choices`) and the compare tray (`medpath.compare`) stay on the device.
- **Decide data:** pages call only `src/features/decide/service.ts`, which reads Postgres (the MCC import, `prisma/import-mcc.ts`) through `src/features/decide/server/`: `catalog.ts` keeps colleges, courses, sources, terms and the option list in memory per process (re-checked against the data version, one primary-key read per request, so it is never older than the cutoffs it labels), and `queries.ts` filters cutoffs and allotments in SQL per call (course, degree, state and college become CollegeSpecialty ids; year, round, quota, category and rank ranges go into the WHERE). There is no demo data at runtime: without `DATABASE_URL` (or with the database down) every service call throws `DataUnavailableError` and Decide shows "Data unavailable" inside its shell (the API answers 503 `data_unavailable`). Unit tests run the same service on the fixture `test/decide.demo.ts` through `setTestCatalog()`. Provenance comes from the data: `DataSource` lists the MCC result PDFs a block uses (Provisional while `DataSource.provisional`), and every fee, stipend, bond and penalty term carries its own source document. Term texts are read into numbers in one place, `server/terms.ts` (`ProgrammeTerms` per programme offered: fee and stipend by year, whole-course fee, bond years/amounts/leaving penalty for that programme, MCC's Round 2 forfeit, numbered sources with the MCC profile id, how many institutes cite that profile, and whether the term was filed under the college's other MD/DNB bucket); pages only render that shape (`components/fees.tsx`). A kind missing from a programme's bucket is taken from the other bucket's MCC-profile term (never an NBEMS or NMC figure); MCh and MPH never take the MD/MS fee or stipend. The Fees page links each row's "Year by year" to the institute's Fees tab (no hidden copy per row). `data/curated/terms_structured.json` is to replace the parsing there, same shape. The one person-level table is `Resident` (names from MCC's admitted-candidates lists, private import): it is read only through `src/features/decide/server/residents.ts`, behind `canSeeResidents()` (see "Access gate").
- **Decide HTTP API** (`src/app/api/v1/*`, GET only): `meta`, `options`, `options/compare`, `dashboard`, `colleges`, `colleges/[slug]`, `cutoffs`, `allotments`, `rank-scan`, `fees` (the Fees page's params, strictly, no profile defaults), `fees/export` (the Fees page's view as CSV, profile defaults included; BOM, formula-safe, `private, no-store`), `trends`, `notices`, `seats` (one seat list; 404 for an unknown list or institute, or no list for the kind, year and round), `score-rank`, `merit-position`; any other `/api/v1` path, `/api/v1` itself included, gets the JSON 404, and any method but GET (HEAD, OPTIONS) a JSON 405 from the middleware. Thin wrappers over `service.ts`; query schemas and helpers in `src/features/decide/api.ts` (profile params use the Decide URL keys). Responses are `{ ok: true, data, page?, sources }` (sources = the MCC result PDFs or fee documents behind the block, with `provisional`) or `{ ok: false, error: { code, message, issues? } }` with 400/401/404/405/500/503. Pagination `page`/`pageSize` (max 200). `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`.
- Use `loading.tsx`, `error.tsx` and `not-found.tsx` per route segment where meaningful.

## Server and client boundaries
- Server Components by default. They fetch through `features/*/services`.
- Client Components (`"use client"`) are only for interactivity: filters, tabs, forms and charts. They receive serialisable props and never import `@/lib/db`, which is enforced by `server-only`.
- Charts are client components in a feature folder (Decide's are hand-written SVG in `components/charts.tsx`).

## Services and API conventions
- Services are plain async functions, for example `listColleges(filters)` and `getCollegeBySlug(slug)`. They return typed domain objects with provenance attached.
- During the demo-data phase a service may read a local typed dataset. Swapping in Prisma is then a change inside the service only. The UI must still label demo data.
- Mutations use Server Actions with Zod-validated input. Route handlers (`app/api/*`) exist for client components that fetch, external consumers (a future mobile app) and webhooks; Server Components call services directly. Exception: Choices relabels a whole list (hundreds of ids) through the Zod-validated Server Action `liveReach` (`app/decide/choices/actions.ts`), because `/api/v1/options/compare` takes at most 4 ids.
- Action and handler results are `{ ok: true, data } | { ok: false, error }`. Do not throw across the client boundary.

## Database access
- The Prisma client is a singleton in `src/lib/db.ts` and is imported only by services.
- Schema changes go through `npm run db:migrate`, and the schema documentation in `docs/DATABASE_SCHEMA.md` is updated in the same change.
- Pages and builds must not require a database until a feature actually reads from it.

## Authentication
Email and password, with no auth library (`src/features/auth`):
- Passwords are hashed with Node `scrypt` and a per-user salt (`lib/password.ts`).
- Sessions are database rows keyed by the SHA-256 of a random 32-byte token. The token lives only in an httpOnly, SameSite=Lax cookie (`medpath_session`, 30 days, Secure in production).
- `getCurrentUser()` is used in server components. Protected pages call it and `redirect("/login")`. The landing page stays static, so the header always shows "Sign in". `/login` and `/signup` send a user who already has Decide access on to `?next=` (see "Access gate"); anyone else sees the form.
- Sign-in and sign-up actions are Zod-validated and rate-limited per IP, and sign-in returns the same error for an unknown email and a wrong password.
- Sign-in always runs scrypt (against a dummy hash for unknown emails), so timing reveals nothing. Password guessing is limited at two levels: 5 failures per 15 minutes for each account and IP pair (in memory), which stops one attacker without locking the real user out elsewhere, and 20 failures on an account from any IP, which locks it for 15 minutes. That second counter is incremented atomically in the database, so parallel guesses can't race past it. At most 4 scrypt runs happen at once per instance (each uses about 128MB).
- Not built yet: password reset, email verification (sign-up needs the invite code instead, see "Access gate"), OAuth, and "sign out everywhere". These need an email provider; add them before accounts hold anything valuable.

## Access gate
Marketing and policy pages, `/login`, `/signup`, `robots.txt`, `sitemap.xml`, icons and the OG image are public. `/decide/**` and `/api/v1/**` are for one invited account only (`src/middleware.ts`, logic in `src/lib/site-access.ts`, server checks in `src/features/auth/lib/session.ts`):
- **Allowlist:** `SEATORA_ALLOWED_EMAILS`, comma-separated (trimmed, lowercased, empties ignored). Sign-up succeeds only for an allowlisted email **and** the `SEATORA_INVITE_CODE` (16+ characters, compared as SHA-256 digests; unset or short closes sign-up), because no email is verified: the address alone would let anyone who knows it claim the account. Anything else gets one message for both cases ("That email and invite code don't match an invite.") and nothing is created. Unset the code once the account exists. Sign-in with a wrong password is unchanged (one generic error, the same rate limits and lockout); a correct password on an account that isn't allowlisted returns "This account doesn't have access." and creates no session.
- **Signed in = allowlisted:** `getCurrentUser()` returns null for an account not on the allowlist, so sessions from before the lock (or of an email since removed) count as signed out everywhere, `/account` included.
- **Cookie:** a successful allowlisted sign-in or sign-up also sets `seatora_access` = `<expiry>.<userId>.<HMAC-SHA-256 of "site-access:<expiry>:<userId>">` (httpOnly, Secure in production, SameSite=Lax, Path=/, 30 days like the session); sign-out deletes it. The HMAC key is `SITE_ACCESS_SECRET` (32+ random characters, `openssl rand -hex 32`) + `|` + the normalised, sorted allowlist, so neither expiry nor user can be changed, and a new secret or allowlist voids every cookie. Checked in constant time with Web Crypto, so it runs at the edge.
- **Middleware** (matcher `/decide/:path*`, `/api/v1/:path*` only) checks the cookie. Without a valid one, pages get `307` to `/login?next=<path and query>` and the API gets `401 { ok: false, error: { code: "unauthorized" } }`. `/login` follows `next` only to a same-origin path (exactly one leading `/`; never `//`, `/\`, a backslash, whitespace or control characters; resolved with `new URL`, so dot segments can't make `//host`, and returned percent-encoded), else `/decide`.
- **Fail closed:** in production, a missing or short secret or an empty allowlist denies every private path (pages: `/login?error=unavailable`; API: `503 access_unconfigured`) and logs one error; public pages keep working. Setting only one of them, or a short secret, does the same in development. With neither set in development the private paths are open and the middleware warns once.
- **Defense in depth:** `hasSiteAccess()` = a valid cookie, and `getCurrentUser()` (so allowlisted) is that cookie's user (false whenever the gate isn't on, even in development). Server Actions can be POSTed to any route (e.g. `POST /` with a `Next-Action` header), past the matcher, so every Decide action checks for itself: `liveReach` through `canUseDecide()` (what the middleware would allow), the hide action through `canSeeResidents()`. The auth and waitlist actions are public.
- **Residents (names)** need `canSeeResidents()` (= `hasSiteAccess()`) in the page, `GET /api/v1/colleges/{slug}/residents` and the hide action, so removing the middleware can never make them public, and they stay hidden in development with the gate off. Reads are limited to 300 per hour per IP and hides to 20. Hiding covers the person: every row with that name at a college with that PIN code, recorded in `HiddenResident` (no foreign key) so it survives re-imports and college key changes.
- **Headers:** private responses are `Cache-Control: private, no-store` (overriding the pages' and API's `s-maxage`). `X-Robots-Tag: noindex, nofollow` only on `/decide`, `/api`, `/login`, `/signup` and `/account` (`next.config.ts`), and `robots.txt` disallows the same paths.
- Not built: revoking one cookie before it expires (sign-out deletes it in that browser; rotate `SITE_ACCESS_SECRET` to void them all), and the middleware can't see a deleted session, though every names read checks the session in the database.

## Validation
Zod is the single validation layer:
- Forms use React Hook Form with `zodResolver`.
- Search params are parsed with Zod; invalid params fall back to defaults instead of failing.
- Ingested datasets are validated with `provenanceSchema` plus a record schema, and invalid rows are rejected and reported, never silently fixed.

## Error handling
- Expected failures (not found, invalid input) return typed results or call `notFound()`.
- Unexpected failures are caught by `error.tsx` boundaries and shown as the design-system error state, with a retry option.
- Log on the server. Never show stack traces or raw error output to users.

## Testing strategy
- **Vitest**: pure logic in `features/*/lib`, validations and formatting. Colocate as `*.test.ts`.
- **Playwright**: one smoke test per route, plus critical interactions (filters, compare, forms), on both desktop and mobile projects.
- `e2e/decide.spec.ts` runs on the real MCC import and asserts its spot values (skipped without `DATABASE_URL`). Set `PLAYWRIGHT_BASE_URL` (e.g. `http://localhost:3191` after `next build && next start -p 3191`) to run it against a started server instead of `npm run dev`. `e2e/smoke.spec.ts` writes to the database (waitlist, sign-up).
- Data-integrity rules get explicit tests, for example that missing values render "—" and that predictions are always labelled historical.
