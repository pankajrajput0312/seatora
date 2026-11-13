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
- Public routes are `/`, `/explore`, `/colleges/[slug]`, `/compare`, `/cutoffs` and `/announcements`.
- Filter and search state lives in URL search params, so it can be shared and works with the back button. Parse params with Zod in `page.tsx`.
- Use `loading.tsx`, `error.tsx` and `not-found.tsx` per route segment where meaningful.

## Server and client boundaries
- Server Components by default. They fetch through `features/*/services`.
- Client Components (`"use client"`) are only for interactivity: filters, tabs, forms and charts. They receive serialisable props and never import `@/lib/db`, which is enforced by `server-only`.
- Recharts is client-only and wrapped in a feature component.

## Services and API conventions
- Services are plain async functions, for example `listColleges(filters)` and `getCollegeBySlug(slug)`. They return typed domain objects with provenance attached.
- During the demo-data phase a service may read a local typed dataset. Swapping in Prisma is then a change inside the service only. The UI must still label demo data.
- Mutations use Server Actions with Zod-validated input. Route handlers (`app/api/*`) exist only for external consumers or webhooks.
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
- Data-integrity rules get explicit tests, for example that missing values render "—" and that predictions are always labelled historical.
