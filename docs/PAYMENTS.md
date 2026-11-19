# Payments (Razorpay Standard Checkout)

A signed-in user buys the Season Pass (₹199, ₹159 with a referral: docs/REFERRALS.md; a discounted price strikes the list price beside it, ~~₹199~~ ₹159; the display-only `PLANS.season_pass.wasAmount`, ₹499, never charged, is struck only in Decide's home box) from the plan cards (Pricing `/pricing#buy`, the planner's `/decide/plan`, the sign-in pop-up, the paywall, the account page) or the planner's home card, all through `SeasonPassButton` (components/season-pass-button.tsx). Code: `src/features/payments`, routes in `src/app/api/payments`.

## What the button shows (`SeasonPassButton`, by `passState` in features/plans/plans.ts)
| She is | Shows |
|---|---|
| Season Pass beyond the free period (paid, PREMIUM, granted), or staff | "Season Pass active till 31 Mar 2027" |
| In the free period (FREE_FOR_ALL_UNTIL ahead), not upgraded | "Upgrade free till 20 Nov" (the free upgrade, docs/PLANS_AND_ROLES.md), and under it "Or keep it till 31 Mar 2027, paid once:" with an outlined "Upgrade for ₹199" (Razorpay; its "Have a coupon or invite code?"; a 100% coupon gives the whole season) |
| In the free period, upgraded free | The card says "Active · free till 20 Nov"; the button: "Keep it till 31 Mar 2027, paid once:" "Upgrade for ₹199" |
| Free plan after the free period | "Upgrade for ₹199" ("~~₹199~~ ₹159 with Rahul's invite", "~~₹199~~ ₹99 with coupon HALF") and "Have a coupon or invite code?"; "Payments open soon" and "Have a coupon?" while payments are off |
| Signed out | the same words, linking to `/signup?next=/pricing#buy` |

Every buy button is hidden while `paymentsOn()` is false; no paid button ever sits beside "no payment needed".

## Flow
1. `BuySeasonPass` (client) → `POST /api/payments/order` with an optional `{ code }`, a coupon or a referral code (Zod; nothing else in the body is read). The server picks the plan and amount (`PLANS` in `plans.ts`, 19900 paise INR, less the coupon's or the referral's discount: `priceFor` in service.ts, coupons first, then `quote` in features/referrals/service.ts), creates a Razorpay order whose receipt is our `Payment.id`, and stores a `Payment` row (`created`, with `listAmount`, `discount`, `referrerId`, `couponId`). It returns `{ orderId, amount, listAmount, discount, inviter, coupon, currency, keyId, email }`; a 100% coupon returns `{ ok: true, free: true, coupon }` instead (below). Answers: 401 when signed out, 400 for a malformed body or a code that doesn't apply (`invalid_coupon` / `invalid_referral`, with the reason), 409 when already paid, 429 after 10 a minute, 502 "Payments are not set up" when Razorpay rejects the keys, 503 while payments are off (a 100% coupon still works), 500 otherwise.
2. The Razorpay modal (`checkout.js`, loaded by `next/script` only where the button is shown to a signed-in buyer) takes the payment.
3. Its success handler → `POST /api/payments/verify` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. The server checks HMAC-SHA256(`order_id|payment_id`, key secret) with `timingSafeEqual` (400 on mismatch, nothing changes), and that the order is this user's (404 otherwise). Then `markPaid`.
4. `POST /api/payments/webhook` covers a buyer who closes the tab after paying: `payment.captured` and `order.paid` → `markPaid`; `payment.failed` → `failed` (a paid order is never changed back); `refund.processed` and `payment.refunded` void the payment's pending referral earning.

`markPaid` is idempotent: a conditional update lets only the first of verify and the webhook through, and only that one, in the same transaction, calls `grantPlan` (`grant.ts`: `User.premiumUntil` = `SEASON_PASS_UNTIL`, default 2027-03-31 23:59:59 IST, never shortening a later date) and `recordEarning` (a pending `ReferralEarning` when the payment has a referrer), and for a coupon order counts the use and records the `CouponRedemption`. `premiumUntil` is what `effectivePlan` reads; the paid `Payment` row is the receipt (`hasPaid`: the order route's 409).

## Coupons
A coupon takes `percentOff` (1–100) off the Season Pass. Code: `coupons.ts` (the rules, pure and tested), `service.ts` (`priceFor`, `redeemFreeCoupon`, `markPaid`, `couponAdmin`), `components/coupon-form.tsx`, the order route, and the Coupons section of `/decide/admin`.
- **Where she types it**: "Have a coupon or invite code?" under the paid button (`applyCode` shows the price, 10 a minute; the order route charges), or "Have a coupon?" in the free period and while payments are off (`CouponForm` posts straight to the order route). `/pricing?coupon=CODE`, `/signup?coupon=CODE` and `/decide/plan?coupon=CODE` show a banner from the server's check of the code (`couponCheck`: "Code DRTARAL: Season Pass free till 31 Mar 2027", "Code SAVE20: 20% off the Season Pass", or quietly why it gives nothing). A good 100% code is the card's main button in every state but a pass ("Apply DRTARAL: free till 31 Mar 2027", `ApplyCoupon`; the free claim's button is hidden meanwhile); signed out it goes to `/signup?coupon=`, and sign-up (or sign-in from there) lands on `/decide/plan?coupon=` (the plan pop-up waits off the plan page). A partial code: after the free period the price is applied at once ("Upgrade for ~~₹199~~ ₹99 with coupon HALF"); in the free period the field opens filled in. Applied: the button stays busy until the card swaps, then a toast "DRTARAL applied: Season Pass till 31 Mar 2027".
- **What she got**: an active pass's card (and the Home box) says it, from her paid payment and premiumUntil (`gotLine`): "₹0 · code DRTARAL · till 31 Mar 2027", "Paid ₹199 · till 31 Mar 2027", or "Active · free till 20 Nov" for the free claim.
- **Checks** (the order route, in this order; any failure is a 400 with the reason): the code names a coupon (else it is tried as a referral code), it is `active` ("This coupon isn't valid."), not past `validUntil` ("This coupon has expired."), `uses < maxUses` ("This coupon has been used up."), `allowedEmail` is hers when set ("This coupon is for another account."), she hasn't redeemed it ("You've already used this coupon.") and has no paid payment; during the free period only 100% coupons work ("This coupon works after 20 Nov."). A coupon replaces any referral discount (they never stack) and earns no referrer anything.
- **100% off** (`redeemFreeCoupon`): no Razorpay and no payment keys needed. In one transaction: `uses + 1` only while `uses < maxUses` (a conditional update, re-checked under the row lock), a paid ₹0 `Payment` (`amount` 0, `discount` = `listAmount`, `couponId`, no `razorpayOrderId`), the `CouponRedemption` (unique per coupon and account, so a repeat or a double click rolls back) and `grantPlan`: the whole season (`SEASON_PASS_UNTIL`), in the free period too. The client shows "Season Pass active — coupon DRTARAL applied" and refreshes.
- **Partial**: a Razorpay order for the discounted price (rounded down to whole rupees, at least ₹1: 50% of ₹199 is ₹99) with `couponId` on the row; `markPaid` counts the use and records the redemption when it is paid. Orders open at the same moment can take a coupon one or two past `maxUses` (checked at order time).
- **Admin** (`/decide/admin` → Coupons, owner or admin; each change writes an `AdminAudit` row `coupon_create` / `coupon_update`): the list (code, % off, uses / max, active, note, who redeemed it and when, and the editable max uses, email and valid-until), "Create coupon" (code A–Z 0–9, 3–20, stored uppercase; % off; max uses, empty = no limit; only for email, empty = anyone; valid until, the end of that IST day, empty = no end; note), Save, and Activate / Deactivate.
- **By SQL** (e.g. at deploy; the migration creates none):
  ```sql
  INSERT INTO "Coupon" ("id", "code", "percentOff", "maxUses", "allowedEmail", "note")
  VALUES (gen_random_uuid()::text, 'DRTARAL', 100, NULL, NULL, 'Shareable: the whole Season Pass free');
  -- Later: UPDATE "Coupon" SET "active" = false WHERE "code" = 'DRTARAL';
  -- Who used it: SELECT u.email, r."createdAt" FROM "CouponRedemption" r JOIN "Coupon" c ON c.id = r."couponId" JOIN "User" u ON u.id = r."userId" WHERE c.code = 'DRTARAL';
  ```

## Environment variables
| Name | Where | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | server | Sent to the browser by the order route, so no `NEXT_PUBLIC_` copy is needed. |
| `RAZORPAY_KEY_SECRET` | server only | Signs orders' API calls and checks the checkout signature. Never `NEXT_PUBLIC_`. |
| `RAZORPAY_WEBHOOK_SECRET` | server only | The secret you type when creating the webhook. Unset: the webhook route answers 503. |

Locally, keep them in `.env.razorpay` (gitignored) and load with `set -a; . ./.env.razorpay; set +a`.

## Test payments (test keys only, no real money)
- Card: `4100 2800 0000 1007`, CVV `123`, expiry `12/26` (any future date). Choose **Maybe later** if it offers to save the card; Razorpay then opens a demo bank page in a popup: click **Success** (or **Failure** to try the failed path).
- UPI: the UPI ID field (`test@razorpay`) is not offered on desktop any more. On a phone-sized window (e.g. 390×844) choose UPI → "Apps & UPI ID" → "Others"; test mode approves it.
- Mobile number in the modal: a valid-looking Indian number such as `9123456789` (Razorpay rejects `9999999999` and `9876543210`).
- Automated runs (Playwright): Razorpay ignores the card form's submit from a `HeadlessChrome` user agent; use a normal Chrome user agent and type the card number (`pressSequentially`).
- Razorpay's own list of test cards and UPI ids: https://razorpay.com/docs/payments/payments/test-card-details/

Check the result: the button shows "Season Pass active till 31 Mar 2027", `SELECT status, amount, discount, "paidAt" FROM "Payment" ORDER BY "createdAt" DESC LIMIT 1` says `paid`, and the buyer's `premiumUntil` is 2027-03-31 18:29:59 UTC. With a referral: amount 15900, discount 4000, and a `ReferralEarning` of 3180 `pending`.

## Webhook setup (Razorpay dashboard)
1. Dashboard → Account & Settings → Webhooks → Add New Webhook (do it once in Test mode and once in Live mode; they are separate).
2. URL: `https://www.seatora.co.in/api/payments/webhook`.
3. Secret: generate one (`openssl rand -hex 32`), paste it here, and set the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel.
4. Active events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` (voids a referral earning).
5. Save, then use "Test webhook" or make a test payment and check the delivery log shows 200.

Payments must be captured for `payment.captured` to fire: keep automatic capture on (Account & Settings → Payment capture). `order.paid` also fires on capture.

## Database
Migration `20261123000000_payments` adds the `Payment` table; `20261124000000_referrals` adds `listAmount`, `discount`, `referrerId` and `ReferralEarning` (docs/REFERRALS.md); `20261124500000_coupons` adds `Coupon`, `CouponRedemption` and `Payment.couponId`, and makes `razorpayOrderId` nullable (a CHECK allows that only for an amount of 0). On Supabase, run `tools/sql/supabase_lockdown.sql` (neetpg-planner) after `migrate deploy`, as for every migration: it turns RLS on for every public table, `Payment` included.

## Content Security Policy
`next.config.ts` allows `https://checkout.razorpay.com` (script, frame), `https://api.razorpay.com` (frame, connect), `https://lumberjack.razorpay.com` (connect) and `https://*.razorpay.com` images. The bank's 3-D Secure page opens in a popup, which our CSP does not cover.

## Going live
1. Complete Razorpay KYC and activate the account; generate Live API keys (Account & Settings → API Keys, Live mode).
2. In Vercel (Production), replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with the live keys (mark the secret Sensitive), and set `RAZORPAY_WEBHOOK_SECRET` to the Live-mode webhook's secret.
3. Migrate (+ lockdown), redeploy, then make one small real payment and check the row is `paid` and the webhook delivery log shows 200.
4. Keep the test keys only in Preview/Development environments.
