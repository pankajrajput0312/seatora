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
- **Decide** (`src/features/decide`, `src/app/decide`): `/decide` (overview), `/decide/options` (`q`, `reach`, `closed`, `prov`, `page`), `/decide/choices`, `/decide/compare?ids=`, `/decide/rank-scan` (`scan`, `year`, `w` = 100 | 250 | 500, default 250), `/decide/last-ranks` (`course`, `lcat`, `lquota`, `inst`, `since` "from year", `sort`, `dir`, `page`; with `inst` and no `page` the page holding that institute's row opens), `/decide/seats` (`tab=matrix|trends`, `page`), `/decide/institutes` (`q`, `state`, `course`, `sort`, `page`), `/decide/institutes/[slug]` (`tab=overview|courses|allotments|fees|clinical`; the Allotments tab also takes `year`, `course`, `page`, 50 per page), `/decide/allotments` (`inst`, `course`, `year`, `round`, `aq` quota, `acat` seat category, `state`, `from`, `to`, `page`; an unknown `inst` is a 404), `/decide/fees` (`program`, `state`, `maxfee`, `sort`, `page`) and `/decide/counselling` (`tab=schedule|announcements|merit`). Sub-navigation uses links with `aria-current`, not ARIA tabs. The sidebar has 11 items in Plan, Research and Counselling groups; on mobile there is a bottom bar with Options, Choices and Rank scan. `decide/not-found.tsx` and `decide/error.tsx` render inside the Decide shell.
- Filter and search state lives in URL search params, so it can be shared and works with the back button. Parse params with Zod in `page.tsx` (`parseSearchParams(schema, params, lists)` in `features/decide/lib/params.ts`: a bad field falls back, ranks accept "30,000"). Filter forms are GET forms (`next/form`, `FilterBar`). A page's own filters never reuse a profile key (hence `aq`, `acat`, `lcat`, `lquota`), or they would leak into her profile on the next link.
- Every link between Decide screens comes from `decideLinks(params)` (`features/decide/lib/links.ts`; `useDecideLinks()` in client components). It keeps the profile params, with repeated values kept (`sp=A&sp=B` becomes `sp=A,B`); `L.with(path, changes)` keeps the page's filters too, `L.page(path, n)` changes the page.
- Lists are paginated on the server (`page`, 25–50 rows): service list functions take an optional `{ page, pageSize }` and return `{ rows, total, page, pageSize }`; pages render `Pager`, never a whole table. Options is the exception: 25 server-rendered rows plus a client "Show N more" that appends the next page from `/api/v1/options` and moves focus to the first new row (`page` is still honoured).
- **Profile in the URL:** the Decide profile (rank, category, PwD, specialties, degrees, quotas, states, max fee and max bond) is saved in localStorage under `medpath.profile` and mirrored into URL params (`rank`, `cat`, `pwd`, `sp`, `deg`, `quota`, `st`, `fee`, `bond`; list params repeated or comma-joined). URL params override the saved profile. Every localStorage value is Zod-validated on read (choice lists item by item, so one bad entry never costs the rest). `DecideShell` adds the saved profile to the URL when it's missing and carries the params on every sub-nav link, so all Decide pages are server-rendered from the URL. Choice lists (`medpath.choices`) and the compare tray (`medpath.compare`) stay on the device.
- **Decide data:** pages call only `src/features/decide/service.ts`, which reads Postgres (the MCC import, `prisma/import-mcc.ts`) through `src/features/decide/server/`: `catalog.ts` keeps colleges, courses, sources, terms and the option list in memory per process (re-checked against the data version once a minute), and `queries.ts` filters cutoffs and allotments in SQL per call (course, degree, state and college become CollegeSpecialty ids; year, round, quota, category and rank ranges go into the WHERE). There is no demo data at runtime: without `DATABASE_URL` (or with the database down) every service call throws `DataUnavailableError` and Decide shows "Data unavailable" inside its shell (the API answers 503 `data_unavailable`). Unit tests run the same service on the fixture `test/decide.demo.ts` through `setTestCatalog()`. Provenance comes from the data: `DataSource` lists the MCC result PDFs a block uses (Provisional while `DataSource.provisional`), and every fee, stipend, bond and penalty term carries its own source document. Decide never holds person-level data such as names.
- **Decide HTTP API** (`src/app/api/v1/*`, GET only): `meta`, `options`, `options/compare`, `dashboard`, `colleges`, `colleges/[slug]`, `cutoffs`, `allotments`, `rank-scan`, `fees`, `trends`, `notices`. Thin wrappers over `service.ts`; query schemas and helpers in `src/features/decide/api.ts` (profile params use the Decide URL keys). Responses are `{ ok: true, data, page?, sources }` (sources = the MCC result PDFs or fee documents behind the block, with `provisional`) or `{ ok: false, error: { code, message, issues? } }` with 400/404/500/503. Pagination `page`/`pageSize` (max 200). `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`.
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
- `getCurrentUser()` is used in server components. Protected pages call it and `redirect("/login")`. The landing page stays static, so the header always shows "Sign in", and `/login` and `/signup` redirect signed-in users to `/account`.
- Sign-in and sign-up actions are Zod-validated and rate-limited per IP, and sign-in returns the same error for an unknown email and a wrong password.
- Sign-in always runs scrypt (against a dummy hash for unknown emails), so timing reveals nothing. Password guessing is limited at two levels: 5 failures per 15 minutes for each account and IP pair (in memory), which stops one attacker without locking the real user out elsewhere, and 20 failures on an account from any IP, which locks it for 15 minutes. That second counter is incremented atomically in the database, so parallel guesses can't race past it. At most 4 scrypt runs happen at once per instance (each uses about 128MB).
- Not built yet: password reset, email verification (so sign-up still reveals an existing email), OAuth, and "sign out everywhere". These need an email provider; add them before accounts hold anything valuable.

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
