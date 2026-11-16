-- Referrals (docs/REFERRALS.md): User.referralCode / referredById / payoutUpi, the discount on Payment, ReferralEarning.
-- On Supabase run tools/sql/supabase_lockdown.sql afterwards (RLS on ReferralEarning).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payoutUpi" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- AlterTable: listAmount is the price before any discount; existing orders had none.
ALTER TABLE "Payment" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "listAmount" INTEGER,
ADD COLUMN     "referrerId" TEXT;
UPDATE "Payment" SET "listAmount" = "amount";
ALTER TABLE "Payment" ALTER COLUMN "listAmount" SET NOT NULL;

-- CreateTable
CREATE TABLE "ReferralEarning" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidOutAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "ReferralEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralEarning_paymentId_key" ON "ReferralEarning"("paymentId");

-- CreateIndex
CREATE INDEX "ReferralEarning_referrerId_idx" ON "ReferralEarning"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE INDEX "Payment_referrerId_idx" ON "Payment"("referrerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app writes only these (features/referrals/lib.ts).
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_status_check" CHECK ("status" IN ('pending', 'paid_out', 'void'));
ALTER TABLE "ReferralEarning" ADD CONSTRAINT "ReferralEarning_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_referralCode_check" CHECK ("referralCode" ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,8}$');
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_check" CHECK ("referredById" <> "id");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_discount_check" CHECK ("discount" >= 0 AND "amount" = "listAmount" - "discount");
