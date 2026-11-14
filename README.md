# Seatora

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
- `photo` is optional: save the image in `public/residents/` and set e.g. `"photo": "/residents/priya.jpg"`. It's shown dithered and colour-tinted like the rest of the site. Without a photo, the card shows a pixel-art doctor generated from their name.
- `consent` must be `true`. Only list people who agreed to be shown publicly with their name **and** the contact details you add. Anything on the page can be copied by anyone.
- Set `verified` to `true` only after checking their allotment letter.
- A bad entry fails `npm run build` with a message naming the field. Rebuild after editing.

## Deploy (Vercel or any Node host)
Public: the landing and policy pages, `/login` and `/signup`. Private: `/decide` and `/api/v1`, for one invited account only (docs/ARCHITECTURE.md "Access gate"). Sign-up is closed to everyone else.

1. Provision PostgreSQL (Supabase, Neon, RDS…).
2. Set the environment:
   - `DATABASE_URL`: the app's connection. On Supabase (serverless), the transaction pooler (port 6543) with `?pgbouncer=true&connection_limit=1` appended.
   - `DIRECT_URL`: the direct connection (port 5432), for migrations and imports. The schema reads only `DATABASE_URL`, so run those with `DATABASE_URL="$DIRECT_URL"`.
   - `SITE_ACCESS_SECRET`: signs the access cookie. Generate with `openssl rand -hex 32` (32+ characters; nobody types it).
   - `SEATORA_ALLOWED_EMAILS`: the email(s) allowed to sign up and sign in, comma-separated. Changing it or the secret signs everyone out of Decide. Without both, production denies `/decide` and `/api/v1`.
   - `SEATORA_INVITE_CODE`: sign-up also needs this code, since nothing verifies the email (anyone who knows an allowlisted address could otherwise claim it). Generate with `openssl rand -hex 8` (16+ characters) and give it to the invitee yourself. Unset or short: sign-up is closed.
   - `NEXT_PUBLIC_SITE_URL` (the public origin, e.g. `https://your-domain.in`) and `NEXT_PUBLIC_CONTACT_EMAIL` (privacy/deletion requests). Production builds fail if either is missing.
3. Once per schema change, with `DATABASE_URL="$DIRECT_URL"`: `npx prisma migrate deploy`. On Supabase, after **every** `migrate deploy` also run `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f tools/sql/supabase_lockdown.sql` from the neetpg-planner repo (RLS on and no Data API access for new tables). Then `npm run db:import` (MCC data, public bundle) and `npm run db:import-residents` (names, private bundle).
4. Build with `npm run build`, start with `npm start`.
5. Before the domain is public: check that no `User` row already has the allowlisted email (`psql "$DIRECT_URL" -c "SELECT id, \"createdAt\" FROM \"User\" WHERE lower(email) = '<email>'"`). If one does and the invitee didn't create it, delete it (its sessions cascade): whoever knows its password would otherwise get in. Then the invited person opens `/signup` and creates the account with the allowlisted email and the invite code. Afterwards, remove `SEATORA_INVITE_CODE` and redeploy, so sign-up is closed for good.

Security headers are set in `next.config.ts`.

## Known
`npm audit` reports `deepmerge-ts` (Prisma CLI) and `minimatch` (ESLint tooling). Both are dev-only and not shipped. Do not run `npm audit fix`: it downgrades typescript-eslint and breaks linting.
