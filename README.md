# MEDPATH

NEET PG counselling planner. Start with [CLAUDE.md](CLAUDE.md) and [docs/](docs).

Current state: production landing page with an early-access waitlist (Phase 1). The planner itself is Phase 2+ (see [docs/ROADMAP.md](docs/ROADMAP.md)).

## Setup
```bash
npm install          # also generates the Prisma client
cp .env.example .env # set DATABASE_URL and NEXT_PUBLIC_SITE_URL
npx prisma migrate dev --name init
npm run dev          # http://localhost:3000
```
Local Postgres:
`docker run -d -p 5432:5432 -e POSTGRES_USER=medpath -e POSTGRES_PASSWORD=medpath -e POSTGRES_DB=medpath postgres:17`

The page renders without a database; only waitlist submissions need one (they show an error until it is configured).

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright, desktop + mobile (run `npx playwright install chromium` once) |
| `npm run db:migrate` | Create/apply Prisma migrations |
| `npm run db:studio` | Browse data, including waitlist sign-ups |

## Adding residents
The landing page's main section shows residents grouped by the hospital or college they joined, with their NEET PG rank, course and contact buttons. Visitors can search, and optionally enter a rank to see the closest residents first. Add people to `src/features/residents/data/residents.json` (a JSON array):

```json
[
  {
    "name": "Full name as they agreed to be shown",
    "rank": 12450,
    "category": "OBC",
    "quota": "AIQ",
    "year": 2025,
    "round": "R2",
    "college": "College name",
    "state": "State",
    "course": "MD General Medicine",
    "contact": {
      "whatsapp": "+919812345678",
      "email": "name@example.com",
      "instagram": "handle",
      "linkedin": "https://www.linkedin.com/in/handle"
    },
    "verified": false,
    "consent": true
  }
]
```
- `category`: Open, EWS, OBC, SC, ST, or any of those with " PwD". `quota`: AIQ, State, Deemed, Central institute, Management, NRI. `round` (optional): R1, R2, R3, Stray, Special stray, State round. `state` is optional.
- `contact` is optional, and every field inside it is optional: `whatsapp`, `phone` (digits with country code, e.g. `+919812345678`), `email`, `instagram` (handle without @) and `linkedin` (full URL). Each one becomes a button.
- `consent` must be `true`. Only list people who agreed to be shown publicly with their name **and** the contact details you add. Anything on the page can be copied by anyone.
- Set `verified` to `true` only after checking their allotment letter.
- A bad entry fails `npm run build` with a message naming the field. Rebuild after editing.

## Deploy (Vercel or any Node host)
1. Provision PostgreSQL (Neon, Supabase, RDS…).
2. Set `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (e.g. `https://medpath.in`) and `NEXT_PUBLIC_CONTACT_EMAIL` (privacy/deletion requests). Production builds fail if either public variable is missing.
3. Run `npx prisma migrate deploy` against production once per schema change.
4. Build with `npm run build`, start with `npm start`.

Security headers are set in `next.config.ts`.

## Known
`npm audit` reports `deepmerge-ts` (Prisma CLI) and `minimatch` (ESLint tooling). Both are dev-only and not shipped. Do not run `npm audit fix`: it downgrades typescript-eslint and breaks linting.
