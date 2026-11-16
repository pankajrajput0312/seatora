# Payments (Razorpay Standard Checkout)

A signed-in user buys the Season Pass (₹499) from the Pricing page or the planner's home card. Code: `src/features/payments`, routes in `src/app/api/payments`.

## Flow
1. `BuySeasonPass` (client) → `POST /api/payments/order`. The server picks the plan and amount (`PLANS` in `plans.ts`, 49900 paise INR; the request body is ignored), creates a Razorpay order whose receipt is our `Payment.id`, and stores a `Payment` row (`created`). It returns `{ orderId, amount, currency, keyId, email }`. Answers: 401 when signed out, 409 when already paid, 429 after 10 a minute, 502 "Payments are not set up" when Razorpay rejects the keys, 500 otherwise.
2. The Razorpay modal (`checkout.js`, loaded by `next/script` only where the button is shown to a signed-in buyer) takes the payment.
3. Its success handler → `POST /api/payments/verify` with `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. The server checks HMAC-SHA256(`order_id|payment_id`, key secret) with `timingSafeEqual` (400 on mismatch, nothing changes), and that the order is this user's (404 otherwise). Then `markPaid`.
4. `POST /api/payments/webhook` covers a buyer who closes the tab after paying: `payment.captured` and `order.paid` → `markPaid`; `payment.failed` → `failed` (a paid order is never changed back).

`markPaid` is idempotent: a conditional update lets only the first of verify and the webhook through, and only that one calls `grantPlan(userId, plan)` (`grant.ts`). Today the paid `Payment` row is the record of access (`hasPaid`); `User.premiumUntil` is set there once the role/premium branch is merged.

## Environment variables
| Name | Where | Notes |
|---|---|---|
| `RAZORPAY_KEY_ID` | server | Sent to the browser by the order route, so no `NEXT_PUBLIC_` copy is needed. |
| `RAZORPAY_KEY_SECRET` | server only | Signs orders' API calls and checks the checkout signature. Never `NEXT_PUBLIC_`. |
| `RAZORPAY_WEBHOOK_SECRET` | server only | The secret you type when creating the webhook. Unset: the webhook route answers 503. |

Locally, keep them in `.env.razorpay` (gitignored) and load with `set -a; . ./.env.razorpay; set +a`.

## Test payments (test keys only, no real money)
- Card: `4100 2800 0000 1007`, CVV `123`, expiry `12/26` (any future date). Razorpay then opens a demo bank page: click **Success** (or **Failure** to try the failed path).
- UPI: `test@razorpay`.
- Mobile number in the modal: any valid-looking Indian number (e.g. `9123456789`).
- Razorpay's own list of test cards and UPI ids: https://razorpay.com/docs/payments/payments/test-card-details/

Check the result: the button shows "Season Pass active", and `SELECT status, "paidAt" FROM "Payment" ORDER BY "createdAt" DESC LIMIT 1` says `paid`.

## Webhook setup (Razorpay dashboard)
1. Dashboard → Account & Settings → Webhooks → Add New Webhook (do it once in Test mode and once in Live mode; they are separate).
2. URL: `https://www.seatora.co.in/api/payments/webhook`.
3. Secret: generate one (`openssl rand -hex 32`), paste it here, and set the same value as `RAZORPAY_WEBHOOK_SECRET` in Vercel.
4. Active events: `payment.captured`, `payment.failed`, `order.paid`.
5. Save, then use "Test webhook" or make a test payment and check the delivery log shows 200.

Payments must be captured for `payment.captured` to fire: keep automatic capture on (Account & Settings → Payment capture). `order.paid` also fires on capture.

## Database
Migration `20261122000000_payments` adds the `Payment` table. On Supabase, run `tools/sql/supabase_lockdown.sql` (neetpg-planner) after `migrate deploy`, as for every migration: it turns RLS on for every public table, `Payment` included.

## Content Security Policy
`next.config.ts` allows `https://checkout.razorpay.com` (script, frame), `https://api.razorpay.com` (frame, connect), `https://lumberjack.razorpay.com` (connect) and `https://*.razorpay.com` images. The bank's 3-D Secure page opens in a popup, which our CSP does not cover.

## Going live
1. Complete Razorpay KYC and activate the account; generate Live API keys (Account & Settings → API Keys, Live mode).
2. In Vercel (Production), replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with the live keys (mark the secret Sensitive), and set `RAZORPAY_WEBHOOK_SECRET` to the Live-mode webhook's secret.
3. Migrate (+ lockdown), redeploy, then make one small real payment and check the row is `paid` and the webhook delivery log shows 200.
4. Keep the test keys only in Preview/Development environments.
