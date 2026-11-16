# Plans and roles

Who may do how much in Decide. Code: `src/features/plans` (`plans.ts` limits and the effective plan, `usage.ts` counting,
`admin.ts` the admin page's reads, `components/` the plan cards, the paywall and the sign-in pop-up), `src/app/decide/plan` ("Your plan"), `src/app/decide/admin`.

## Roles (`User.role`)
| Role | Who | Plan |
|---|---|---|
| `OWNER` | Runs the site: feature requests, Ask Seatora, `/decide/admin` (can grant Owner and Admin) | Premium, no limits |
| `ADMIN` | `/decide/admin` (can grant Free and Premium and set Season Pass dates for non-staff) | Premium, no limits |
| `PREMIUM` | Holds the Season Pass with no end date | Premium |
| `FREE` | Everyone else (default) | Free |

- `SEATORA_OWNER_EMAILS` bootstraps owners: `getCurrentUser()` promotes such an account to `OWNER` the first time it is seen signed in (also right after sign-in). Removing an email from the variable does not demote it: change the role on `/decide/admin`. `isOwner()` = role `OWNER`, or the email on the variable (fallback).
- `User.premiumUntil`: Premium until then whatever the role (a Season Pass with an end; set as a date, it runs to 23:59:59 IST that day). `createdVia` ("signup") and `notes` are for the admin page only.

## Effective plan
Premium if the role is `OWNER`, `ADMIN` or `PREMIUM`, or `premiumUntil` is in the future, or now is before `FREE_FOR_ALL_UNTIL`; else Free. Owner and admin get no limits at all (their use is still counted). Every "free till 20 Nov" in the copy (sidebar footer, plan cards, Pricing, home card, sign-up, FreePrice on the landing page and the policies) is `FREE_FOR_ALL_UNTIL` formatted (`freeNow()`, `shortDate()`), never typed in. The landing page re-renders hourly, so its price turns to ₹499 within an hour of the end.

## Upgrade (free in the free period)
`passState()` (plans.ts) says where she stands: `staff`, `pass` (Season Pass beyond the free period), `claimed` (the free upgrade), `claimable` (free period on, not upgraded), `free` (Free plan after it).
- **Free upgrade**: "Upgrade to Season Pass, free till 20 Nov" (`ClaimFreePass` → `claimFreeSeasonPass` action → `claimFreePass`, claim.ts) sets `premiumUntil = FREE_FOR_ALL_UNTIL` when it is null or earlier: no payment, no table, a `free_pass_claimed` console event. Idempotent, never shortens a later (paid) date, refused once the free period is over. When FREE_FOR_ALL_UNTIL passes, her `premiumUntil` has passed too, so she is back on Free and sees "Upgrade · ₹499".
- **Plan cards** (`PlanCards`, components/plan-cards.tsx): Free and Season Pass side by side (stacked on phones, the Season Pass first), each a ✓/✕ list read from `planLimits` (never typed in); the Season Pass card in Seatora's ink and cyan with a "Free till 20 Nov" ribbon and "~~₹499~~ ₹0 till 20 Nov" in the free period, ₹499 (₹399 with an invite) after, and `SeasonPassButton` as its call to action; her plan's card has a "Your plan" badge (the Free card a disabled "Current plan"); `claimable` counts as Free. Used by the sign-in pop-up ("Choose your plan"), `/decide/plan`, `/pricing#buy`, the paywall and the account page.
- **Where**: every in-app upgrade link goes to `/decide/plan` ("Your plan": plan, today's institutes and residents searches, Season Pass until, the cards, the referral offer): the sidebar's footer (pinned to the sidebar's and the phone menu's bottom: her initial, name and `planLine()` ("Free plan", "Season Pass · free till 20 Nov", "Season Pass · till 31 Mar 2027", "Owner"), with a cyan "Upgrade" ("Free till 20 Nov" under it) for `claimable` and `free`), the header's plan chip ("Free · Upgrade" / "Season Pass") and the paywall's "Compare plans". `/pricing` stays the public page. The planner's home card and the cards use `SeasonPassButton` (docs/PAYMENTS.md): the paid "Keep it for the whole season" option sits under the free upgrade while payments are on.

## Limits (per account, per IST day: they reset at 00:00 Asia/Kolkata)
| Feature (`Feature`) | Free | Premium | Env override | Enforced in |
|---|---|---|---|---|
| Ask Seatora questions a day (`ask`) | 3 | 50 | `PLAN_FREE_ASK`, `PLAN_PREMIUM_ASK` | `POST /api/ask/chat` (new questions; continues are free). Ask stays owner-only unless `ASK_FOR_MEMBERS=1` |
| Distinct institute pages a day (`institutes`) | 10 | unlimited | `PLAN_*_INSTITUTES` | `/decide/institutes/[slug]` (any tab; the same institute again today is free), `GET /api/v1/colleges/{slug}` |
| Residents searches / views a day (`residents`) | 10 | 200 | `PLAN_*_RESIDENTS` | `/decide/residents` (one per search page), the institute Residents tab, `GET /api/v1/colleges/{slug}/residents`, Ask's `residents_at`. Plus 300 an hour per IP, as before |
| CSV exports (`csv`) | none | yes | `PLAN_*_CSV` (0 = none) | `GET /api/v1/{allotments,fees,seats,options}/export` → 403 `plan_required`. Choices' own CSV (her list, built in the browser) is not limited |
| Options in Compare (`compare`) | 2 | 4 | `PLAN_*_COMPARE` | `/decide/compare` shows the first N and the paywall; `GET /api/v1/options/compare` → 403 past N. The tray still holds 4 |
| Plan reports (`reports`) | none | yes | `PLAN_*_REPORTS` | Ask's `create_report` |
| Saved choice lists (`choiceLists`) | 1 | 10 | `PLAN_*_CHOICE_LISTS` | Choices hides "Duplicate" at the cap; the sync action refuses more lists than the plan and than the account already holds (lists kept from a bigger plan stay editable); Ask's `save_choice_list` |

Overrides: `PLAN_<FREE|PREMIUM>_<FEATURE>` (camelCase becomes `_`: `PLAN_FREE_CHOICE_LISTS`) = a whole number, or `unlimited` / `-1`. Anything else keeps the default.

## Counting (`usage.ts`)
`checkAndCount(userId, feature, key?)` → `{ allowed, used, limit, resetAt }`, server-side only:
- `UsageDaily` (userId, day, feature, count), primary key (userId, day, feature): one `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 WHERE count < limit RETURNING count`. No row back = refused, and nothing is counted.
- With `key`, `UsageDistinct` (userId, day, feature, key): the key already there today = allowed for free; else inserted only while today's distinct count is under the limit (count-then-insert: two parallel first views can pass the last slot by one).
- `day` is the IST date. `ResidentsRead` (the old per-UTC-day residents counter) is no longer written; drop it in a later migration.

## Admin (`/decide/admin`)
Owner and admin only (anyone else: not found; noindex). The nav's Help group shows "Admin" only to them.
- Totals: accounts by role; sign-ups per IST day; uses per feature per day (and how many accounts); Ask runs, tokens and cost per day from `AskLog` at list prices (docs/ASK_SEATORA.md "Cost").
- Accounts, newest first, 50 a page, search by email or name: plan, created, last active (latest sign-in or counted use), today's counts, and a form per row (role, Season Pass until, notes). The action (`setUserAccess`, Zod) checks the caller itself: only an owner grants or changes Owner and Admin; nobody changes their own role. Every save writes an `AdminAudit` row (actor, target, before, after).

### Grant the Season Pass
On `/decide/admin`, search the email, then either set the role to Premium (no end) or leave Free and set "Season Pass until" (e.g. the end of the season), Save. Or in SQL: `UPDATE "User" SET "premiumUntil" = '2027-03-31T23:59:59+05:30' WHERE email = '…';`.

## Env
| Variable | Default | |
|---|---|---|
| `FREE_FOR_ALL_UNTIL` | unset | ISO date-time, e.g. `2026-11-20T23:59:59+05:30`: everyone gets Premium limits before it, the free upgrade runs to it, and every "free till" date shown is it |
| `ASK_FOR_MEMBERS` | unset | `1` opens Ask Seatora (still needs `ASK_ENABLED=1`) to every signed-in member, with their plan's questions a day |
| `PLAN_<PLAN>_<FEATURE>` | the table above | Overrides one limit |

## Indexes (same migration)
Measured on a scratch copy of the real data (77,708 residents, 209,571 allotments, 133,204 cutoffs), `EXPLAIN (ANALYZE)` median of 5 warm runs, local Postgres 18. Only the ones that helped were kept.

| Query | Before | After | Change |
|---|---|---|---|
| Residents search `q=` (one token), count | 57 ms | 2.4 ms | pg_trgm GIN on `Resident.name` + the token's colleges looked up first (`residents-all.ts`), so the OR is a BitmapOr of two indexes |
| Residents search, page of 50 (sort year) | 60 ms | 4.1 ms | same |
| Residents search, two tokens | 57 ms | 0.5 ms | same |
| Name dropdown (`residentNames`) | 25 ms | 1.6 ms | the GIN |
| Residents sorted by name, page 1 | 17.5 ms | 0.1 ms | `(name, year DESC, id)` |
| Residents year 2024 by name, page 3 | 16.5 ms | 0.8 ms | same |
| Year filter's years (`residentYears`) | 12.5 ms | 4.3 ms | `(hidden, year)`: index-only scan |

Checked and left alone (already indexed or no gain): institute Residents tab (2.4 ms, `(collegeId, year)`; the rest is the sort by course), course filter (2 ms), allotments latest round (count 5 ms, page 9 ms: `(counsellingYear, round, rank)` gave nothing and slowed the rank-range query 0.9 → 3 ms, so dropped), allotments rank range (0.9 ms), session by id, Ask chats by user, `UsageDaily` lookups (primary key), admin's account list (0.1 ms; add `User(createdAt)` past ~50k accounts). Partial indexes were avoided: Prisma sends `hidden = $1`, which a generic plan can't match to `WHERE NOT hidden`.

## Deploy
1. Back up, then `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` (`20261122000000_plans_roles`: the role columns, `UsageDaily`, `UsageDistinct`, `AdminAudit`, `pg_trgm` and the indexes below). On Supabase run `tools/sql/supabase_lockdown.sql` right after (RUNBOOK 1.3 c): the three new tables need RLS on and no Data API grants.
2. Set `FREE_FOR_ALL_UNTIL=2026-11-20T23:59:59+05:30` on Vercel (Production) before deploying, so nobody meets a limit before then. Deploy.
3. Sign in as the owner once (promotes the account to `OWNER`), open `/decide/admin`. A member: no Admin entry, `/decide/admin` is not found.
