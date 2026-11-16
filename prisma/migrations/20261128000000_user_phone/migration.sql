-- WhatsApp: an account's number (features/whatsapp), unique so one number is one account.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
