-- A coupon's owner: the person who shares it (Refer & earn shows them its link). Additive: null for every coupon now.

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Coupon_ownerId_idx" ON "Coupon"("ownerId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
