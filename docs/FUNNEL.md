# Funnel, multiple-account guard and error tracking

First-party only: events and errors go to our own Postgres, no analytics or error SDK. Code: `src/features/funnel`
(`lib.ts` names, the stage math and error scrubbing, pure and tested; `validations.ts` the events schema; `service.ts` `track`, `recordError`, the
device and network of a request; `admin.ts` the admin reads; `components/beacon.tsx` the browser side),
`src/app/api/events/route.ts`, `src/middleware.ts` (the device cookie), `src/instrumentation.ts` (server errors),
`/decide/admin` (Funnel, Possible duplicates, Errors). Migration `20261125000000_funnel_guard`.

## Who is who
- **Device**: `seatora_aid`, 16 random bytes base64url, httpOnly, SameSite=Lax, a year, Secure in production. The
  middleware sets it on page requests that lack it (matcher: every path but `_next/`, `/api/` and files with an
  extension), never for bots (`isBot`: crawlers, link previews incl. WhatsApp, curl/python, HeadlessChrome, no user
  agent), and puts it on that same request so a first visit's page or `/r/` link already sees it.
- **Account**: sign-up stores `User.signupAid` and `User.signupIpHash`; every session (sign-up and sign-in) stores
  `Session.aid` and `Session.ipHash`.
- **Network**: `ipHash()` = HMAC-SHA256(IP from `clientIp()`, `SITE_ACCESS_SECRET`), first 16 hex characters. The raw
  IP is never stored; rotating the secret makes old and new hashes unrelated.
- **A person** in every count = the account when known, else the device (`coalesce(userId, 'aid:' || aid)`); an event
  with neither is stored but counted as nobody.

## Events (`FunnelEvent`: at, name, aid, userId, placement, meta)
`track(name, { userId?, aid?, placement?, meta? })` (server) writes after the response (`after()` from next/server; outside
a request, at once), never throws and never waits on the database. `aid` defaults to the request's cookie. `meta` is
small and never personal.

| Event | Where | Side | meta |
|---|---|---|---|
| `landing_view`, `pricing_view`, `signup_view` | `/`, `/pricing`, `/signup` (`TrackView`, once per page load) | browser | |
| `signup_done` | `signUp` action | server | `referred` |
| `signin_done` | `signIn` action | server | |
| `plan_popup_shown` / `plan_popup_dismissed` | `PlanPrompt` opens / Not now, ×, Esc, a click outside | browser | |
| `upgrade_click` | any element with `data-upgrade` (one listener, `UpgradeClicks` in the root layout) | browser | placement |
| `free_claimed` | `claimFreePass` when it changed `premiumUntil` | server | |
| `checkout_opened` | `POST /api/payments/order`, once the order exists | server | `amount`, `referred`, `coupon` |
| `checkout_cancelled` | Razorpay `ondismiss` (not after a failure) | browser | |
| `payment_failed` | Razorpay `payment.failed`; the webhook's `payment.failed` (`markFailed`) | both | |
| `payment_paid` | `markPaid`, only the call that marked it; or a 100% coupon's redemption (`redeemFreeCoupon`, `amount` 0, no checkout_opened) | server | `amount`, `referred`, `coupon` |
| `paywall_shown` | `Paywall` renders | server | `feature`, `device` |
| `referral_link_open` | `GET /r/CODE` (not bots) | server | `valid` |
| `referral_page_view` | `/decide/refer` | browser | |

**Placements** (`upgrade_click`): `popup`, `sidebar_footer`, `header_chip`, `home_card`, `plan_page`, `paywall`,
`pricing`, `account`. A CTA's `data-upgrade` value, else the nearest `data-placement` around it: the plan cards'
`SeasonPassButton` (free claim, buy, signed-out link) is marked `data-upgrade=""` and the pop-up, paywall, Pricing
`#buy`, `/decide/plan`, the account page and the home card carry `data-placement`; the sidebar's Upgrade and the header
chip (only while it says Upgrade) name themselves.

**`POST /api/events`** (`navigator.sendBeacon`, else a keepalive fetch): `{ name, placement? }` with `name` from
`CLIENT_EVENTS` and `placement` from `PLACEMENTS`, or `{ kind: "client_error", message, digest?, route }`. Zod strips
anything else: the device and account come from the cookies, never the body. Bots get 204 and nothing is stored. 60
events and 10 errors a minute per device (in memory, per instance). 204, 400 for anything off the whitelist, 413 over 4 KB.

## Admin: Funnel (`/decide/admin`, range Today · 7 days · 30 days · All; default 7 days)
- **Upgrade funnel**: unique people per stage, step % (vs the stage before) and overall % (vs the first):
  visited home or pricing → opened sign-up → signed up → saw the plan pop-up → clicked Upgrade → claimed free or opened
  checkout → paid. Stages are counted independently, so someone who signed up from `/decide` counts at "Signed up"
  without a landing view.
- **Upgrade clicks by placement**: clicks and people.
- **Checkout**: opened, cancelled, failed, paid (events and people) and revenue = the sum of paid `Payment` rows in the range.
- **Referrals**: link opens → referred sign-ups (`signup_done` with `referred`) → referred and paid → earnings (not void).
- **Paywall hits by feature**.
- **Last 14 days (IST)**: unique people per stage per day.
Plain SQL on `FunnelEvent` with the indexes (name, at), (userId), (aid). The stage math (`funnel()` in lib.ts) runs on
the distinct (name, account, device) rows: fine for thousands of people a month; move it into SQL past ~100k.

## Multiple-account guard
- **Sign-ups per device**: `signUp` refuses when this `seatora_aid` already created `SIGNUP_PER_DEVICE` (default 3)
  accounts in the last 30 days: "This device already has 3 Seatora accounts. Sign in to one of them." Not capped by IP
  (hostels and colleges share one); the existing 5 an hour per IP stays. No cookie, no device cap.
- **Free daily limits per device**: `checkAndCount(userId, feature, key, { account, aid })` also counts the device,
  as the subject `aid:<aid>` in the same `UsageDaily` / `UsageDistinct` tables with the same Free limits, for residents
  searches (`residentsDenied`) and distinct institute pages (the page and `GET /api/v1/colleges/{slug}`). Only on the
  Free plan: Premium (paid, granted, the free upgrade), staff and everyone during `FREE_FOR_ALL_UNTIL` are never
  device-capped. The device is checked first, so a use it refuses counts for neither. Refused by the device: the paywall
  says "This device has used today's free residents searches" (`residentsDenied` → `device_limit`; the API answers 429
  `device_limit`). Ask Seatora's questions are per account only.
- **Possible duplicates** (admin): accounts sharing a `signupAid`, or a `signupIpHash` with sign-ups within 24 hours of
  each other (newest first, 30 groups; a set already shown by device isn't repeated by network): email, created, plan,
  paid, and a link to the account's row (role, Season Pass, notes). Nothing is automatic; the terms already allow
  withholding referral payouts for duplicate accounts.

## Errors (`ErrorGroup`)
- **Server**: `src/instrumentation.ts` `onRequestError` (renders, route handlers, Server Actions; Node only) →
  `recordError({ message, digest, route: the route pattern, method, kind: "server" })`. Redirects and not-found are not errors.
- **Browser**: `app/error.tsx` and `app/decide/error.tsx` post `{ message, route: location.pathname }` to
  `/api/events` as `client_error`, for errors thrown in the browser. An error that reaches the boundary with a `digest`
  was thrown on the server (with Next's generic production message) and is already grouped there, so it isn't sent again.
- **Stored**: the message's first and last line (Prisma puts the call's arguments in between) with query strings,
  emails and tokens (20+ letter-and-digit runs) removed, ≤ 500 characters; the route without its query. Never bodies,
  headers or names. **Fingerprint** = sha1(kind, route, message with ids (8+ characters with a digit) and numbers as
  placeholders). One upsert: count + 1, `lastAt`, `lastDigest`, and `resolvedAt` cleared (a resolved group reopens).
- **Alerts**: `ALERT_WEBHOOK_URL` set → POST `{ "text": "…", "content": "…" }` (Slack reads `text`, Discord `content`) on
  a fingerprint's 1st, 10th and 100th occurrence, with a link to the admin section. Fire-and-forget, 3 s timeout. Unset: no alerts.
- **Admin "Errors"**: open groups seen in the last 7 days, most frequent first (count, last seen, route, kind, digest,
  message), each with "Resolved" (an `AdminAudit` row `error_resolved`).

## Privacy and retention
The privacy page says it in plain words: first-party usage events to improve Seatora, no third-party trackers; the
device cookie and a hashed IP to prevent abuse; error reports without personal data; 12 months.
ponytail: no cleanup job yet. When one is wanted (a Vercel cron or a manual monthly run):
`DELETE FROM "FunnelEvent" WHERE "at" < now() - interval '12 months'; DELETE FROM "ErrorGroup" WHERE "lastAt" < now() - interval '12 months';`
and null `Session.aid` / `ipHash` past expiry (sessions are deleted when found expired anyway).

## Env
| Variable | Default | |
|---|---|---|
| `SIGNUP_PER_DEVICE` | 3 | Accounts one device may create in 30 days (whole number ≥ 1) |
| `ALERT_WEBHOOK_URL` | unset | Slack or Discord incoming webhook for error alerts; unset = none |
| `SITE_ACCESS_SECRET` | (already set) | Also the key of the IP hash |

## Deploy
1. Back up, then `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` (`20261125000000_funnel_guard`: User and Session
   columns, `FunnelEvent`, `ErrorGroup`, indexes). On Supabase run `tools/sql/supabase_lockdown.sql` right after (RLS on
   the two new tables).
2. Optional env on Vercel (Production): `ALERT_WEBHOOK_URL`, `SIGNUP_PER_DEVICE`. Deploy.
3. Check: open `/` in a private window (a `seatora_aid` cookie appears), sign up, open `/decide/admin` → Funnel (Today).
