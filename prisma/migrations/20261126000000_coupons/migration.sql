-- Coupons (docs/PAYMENTS.md "Coupons"): Coupon, CouponRedemption and Payment.couponId. A 100% coupon's Payment row has no
-- Razorpay order, so razorpayOrderId becomes nullable (only for an amount of 0). No coupon is created here: they are made on
-- /decide/admin or by SQL. On Supabase run tools/sql/supabase_lockdown.sql afterwards (RLS on the new tables).

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "couponId" TEXT,
ALTER COLUMN "razorpayOrderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "allowedEmail" TEXT,
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_paymentId_key" ON "CouponRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The app writes only these (features/payments/coupons.ts).
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_code_check" CHECK ("code" ~ '^[A-Z0-9]{3,20}$');
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_percentOff_check" CHECK ("percentOff" BETWEEN 1 AND 100);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_uses_check" CHECK ("uses" >= 0 AND ("maxUses" IS NULL OR "maxUses" >= 1));
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_allowedEmail_check" CHECK ("allowedEmail" = lower("allowedEmail"));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_razorpayOrderId_check" CHECK ("razorpayOrderId" IS NOT NULL OR "amount" = 0);
