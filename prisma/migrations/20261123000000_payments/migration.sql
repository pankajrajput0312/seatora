-- Payments (Razorpay Checkout, features/payments). On Supabase run tools/sql/supabase_lockdown.sql afterwards (RLS on Payment).
-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- status is one of these (the app writes no other).
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_status_check" CHECK ("status" IN ('created', 'paid', 'failed'));
