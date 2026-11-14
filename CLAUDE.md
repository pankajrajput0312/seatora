# MEDPATH — Project Instructions

**Read this file before modifying the project, then read the linked doc for the area you are changing.** Keep it concise; detail lives in `docs/`.

## Product
MEDPATH is a NEET PG counselling and college decision platform for India: college discovery, institute profiles, historical cutoffs, seat matrices, fees/stipends/bonds, resident experiences, comparisons, rank-based discovery and counselling announcements.
Audience: NEET PG aspirants, doctors preparing for PG admission, AIQ and state counselling participants, and medical students researching colleges.
Details: [docs/PRODUCT.md](docs/PRODUCT.md) · phases: [docs/ROADMAP.md](docs/ROADMAP.md)

## Stack
Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 · Geist fonts · Astryx (`@astryxdesign/core`, inside app only) · PostgreSQL + Prisma 6 · Radix UI (`radix-ui`) · Lucide React · React Hook Form + Zod · Recharts · Vitest · Playwright.
Do not add a dependency unless the existing stack plus a few lines of code cannot do the job.

## Architecture
Modular monolith. `src/app` routes are thin and compose features. Domain logic lives in `src/features/<feature>/`, DB access only in server code via `@/lib/db`. Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · data model: [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)

## Conventions
- Files and folders: `kebab-case.tsx`. Components: `PascalCase`. Hooks: `useX`. Zod schemas: `xSchema`, inferred types share the base name.
- Named exports, except where Next.js requires a default (`page.tsx`, `layout.tsx`).
- Server Components by default. Add `"use client"` only for interactivity, as low in the tree as possible.
- Validate every external input (forms, search params, API bodies, imported datasets) with Zod.
- No speculative abstractions, no empty placeholder files. Build a thing when a feature needs it.

## Design systems (enforced): two, never mixed on one page
- **Public site** (`src/app/(site)`: landing, privacy, auth): [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md), a dark, cool interface modelled on roook.space, using Geist Sans with Geist Pixel for display and scanlines.
- **Inside app** (`src/app/decide`): [docs/APP_DESIGN_SYSTEM.md](docs/APP_DESIGN_SYSTEM.md), the light "case sheet" system on Astryx (Meta's design system), set in Atkinson Hyperlegible Next.
- Tokens live in `src/app/globals.css`: `@theme` for the site, with the `.app` scope overriding them for the inside app. Use only token classes (`bg-card`, `text-muted-foreground`, `border-border`, `text-leaf`…), never hex or raw OKLCH values in components.
- Signal colours (`sky`, `leaf`, `sun`, `ember`) carry meaning only. No gradients, blobs or decorative glow (the hero vignette is the documented exception).
- Ranks, fees and statistics use `numeric` in columns. `font-pixel` is used on the public site only.

## Component reuse
Check `src/components/ui` and `src/components/layout` before writing UI. Extend an existing component with a variant rather than duplicating it. Feature-specific components stay inside their feature folder until a second feature needs them.

## Data integrity (non-negotiable)
Read [docs/DATA_INTEGRITY.md](docs/DATA_INTEGRITY.md). In short:
- Never fabricate colleges, cutoffs, fees, reviews, testimonials, rankings or announcements. Demo data must be labelled as demo data in the UI.
- Every displayed data point carries provenance (`src/types/provenance.ts`) and shows a `SourceLabel`.
- Historical cutoffs are never presented as a prediction or guarantee of admission.
- Missing data renders as "—", never as 0.

## Testing
- `npm run test` (Vitest): domain logic, formatting, validation. Colocate as `*.test.ts`.
- `npm run test:e2e` (Playwright, desktop and mobile): one smoke path per route.
- Before finishing any change, run `npm run typecheck && npm run lint && npm run test`.

## Making changes
1. Read this file and the relevant doc.
2. Reuse what already exists.
3. Make the smallest change that works.
4. If architecture, schema or product decisions change, update the relevant doc in the same change.
