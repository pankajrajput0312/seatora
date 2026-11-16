-- Funnel, multiple-account guard and error tracking (docs/FUNNEL.md): the sign-up device and hashed IP on User and
-- Session (never the raw IP), first-party FunnelEvent rows and ErrorGroup. On Supabase run tools/sql/supabase_lockdown.sql
-- (neetpg-planner) right after: RLS on the two new tables.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "signupAid" TEXT,
ADD COLUMN     "signupIpHash" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "aid" TEXT,
ADD COLUMN     "ipHash" TEXT;

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "aid" TEXT,
    "userId" TEXT,
    "placement" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorGroup" (
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDigest" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("fingerprint")
);

-- CreateIndex
CREATE INDEX "FunnelEvent_name_at_idx" ON "FunnelEvent"("name", "at");

-- CreateIndex
CREATE INDEX "FunnelEvent_userId_idx" ON "FunnelEvent"("userId");

-- CreateIndex
CREATE INDEX "FunnelEvent_aid_idx" ON "FunnelEvent"("aid");

-- CreateIndex
CREATE INDEX "User_signupAid_idx" ON "User"("signupAid");

-- CreateIndex
CREATE INDEX "User_signupIpHash_idx" ON "User"("signupIpHash");

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

