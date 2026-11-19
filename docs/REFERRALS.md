# Referrals ("Refer & earn")

A friend who comes through her link gets 20% off her first Season Pass; the referrer earns 20% of what the friend actually
paid, sent to her UPI by hand from the admin page. Code: `src/features/referrals` (`lib.ts` the math, codes and UPI
schema, pure and tested; `service.ts` the reads and writes; `actions.ts`; `components/`), `src/app/r/[code]/route.ts`,
`src/app/decide/refer`, the order route and `markPaid` (docs/PAYMENTS.md), the Referrals section of `/decide/admin`.

## Money (paise, decided on the server only)
| | Rule | ₹199 price (`PLANS.season_pass.amount`; the struck ₹499 is display only) |
|---|---|---|
| Friend's price | 20% off, rounded down to whole rupees (`discountedPrice`) | ₹159 (15900; discount 4000) |
| Referrer's earning | floor(20% of the amount actually paid) (`earningFor`) | ₹31.80 (3180) |

## Flow
1. **Her code**: `User.referralCode`, 7 characters of `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O, 1/I/L; a CHECK allows 6–8), made the first time she opens `/decide/refer` and never changed (no action edits it).
2. **The link** `GET /r/CODE`: 30 lookups a minute per IP (`allow()`, 429 after). A real code sets the `seatora_ref` cookie (httpOnly, SameSite=Lax, 30 days, Secure in production) and redirects (307, relative) to `/signup?ref=CODE`, or `/pricing` when signed in. An unknown code redirects to `/signup` without the cookie. Sign-up and Pricing show "Rahul invited you — 20% off the Season Pass": the first name only, never the email.
3. **Sign-up** sets `User.referredById` from the cookie, else `?ref=` (a code that exists; a new account can't be its own referrer; a DB CHECK forbids `referredById = id`).
4. **Checkout** (`quote` in service.ts, used by the page for display and by `POST /api/payments/order` for the charge): the referrer is her own `referredById` first, else the code sent as `{ code }` (from the cookie, or typed under "Have a coupon or invite code?", checked by `applyCode`, 10 a minute; a code that names a coupon is a coupon, which replaces the referral discount and earns nothing: docs/PAYMENTS.md "Coupons"). Refused: an unknown code, her own code, or a buyer with any paid payment (one discount per buyer, first purchase only); a typed code that fails is a 400 `invalid_referral` with the reason, never a silent full charge. The client never sends an amount. The `Payment` row keeps `listAmount`, `discount` and `referrerId`; the order response and the button show "~~₹199~~ ₹159 with Rahul's invite", the Razorpay modal the ₹159 order. The plan cards, the plan pop-up and the Home box show her invite too (`inviteLine`): "Rahul's invite: ₹159 after 20 Nov (instead of ₹199)" in the free period, "₹159 with Rahul's invite" after it; the share text in the free period is "Seatora is free till 20 Nov — then 20% off with my link: <link>".
5. **Earning**: in `markPaid`'s transaction, after the plan is granted, a payment with a `referrerId` gets a `ReferralEarning` (`pending`). Once per payment: `markPaid` lets one call through, and `createMany … skipDuplicates` on the unique `paymentId` backs it up without failing the transaction.
6. **Refund**: the webhook's `refund.processed` / `payment.refunded` sets a still-pending earning `void` with the refund id and time in `note`. A partial refund voids it too. An earning already paid out is left as it is (recover it by hand).
7. **Payout**: `/decide/admin` → Referrals: pending earnings grouped by referrer (email, UPI, total, payments, buyers' emails). Pay the total by UPI, type the UPI reference, "Mark paid out" (`paid_out`, `paidOutAt`, `note`); or "Void" with the reason. Only the earnings listed on the page change; owner or admin only; each writes an `AdminAudit` row (`referral_paid_out` / `referral_void`, target = the referrer).

## Abuse guards
No self-referral (code check, DB CHECK); one discount per buyer (no paid payment before); the referrer must exist (`Payment.referrerId` and `User.referredById` are SET NULL if she deletes her account, earnings cascade); codes can't be changed by users; `/r/` and code checks are rate-limited; payouts are manual, within 7 days after the payment and any refund window, and may be withheld for duplicate or fake accounts (terms: `/terms#referrals`).

## Free period and payments off
Sharing works any time. While `paymentsOn()` is false the page says discounts and earnings start when paid passes open; during the free period (FREE_FOR_ALL_UNTIL) with payments on, friends who pay to keep the pass for the season get the discount and the referrer earns on it.

## Database (migration `20261124000000_referrals`)
`User.referralCode` (unique, CHECK pattern), `User.referredById` (FK SET NULL, indexed, CHECK ≠ id), `User.payoutUpi`; `Payment.listAmount` (backfilled = amount), `Payment.discount` (default 0; CHECK amount = listAmount − discount), `Payment.referrerId` (FK SET NULL, indexed); `ReferralEarning` (id, referrerId FK cascade + index, paymentId unique FK cascade, buyerId, amount ≥ 0, status CHECK pending | paid_out | void, createdAt, paidOutAt, note). Run the Supabase lockdown after it (RLS on the new table).
