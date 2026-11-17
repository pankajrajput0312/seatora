-- "Continue with WhatsApp" sign-in challenges (features/auth/lib/whatsapp-login.ts). On Supabase run
-- tools/sql/supabase_lockdown.sql afterwards (RLS on the new table).

-- CreateTable
CREATE TABLE "LoginChallenge" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_codeHash_key" ON "LoginChallenge"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "LoginChallenge_browserHash_key" ON "LoginChallenge"("browserHash");

-- CreateIndex
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginChallenge" ADD CONSTRAINT "LoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
