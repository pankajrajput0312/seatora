-- Plans and roles (docs/PLANS_AND_ROLES.md): User.role / premiumUntil / createdVia / notes, the usage counters
-- (UsageDaily, UsageDistinct) and the admin audit log. Owners: SEATORA_OWNER_EMAILS is promoted to OWNER at sign-in (code).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'PREMIUM', 'FREE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdVia" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "premiumUntil" TIMESTAMP(3),
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "UsageDaily" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "feature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("userId","day","feature")
);

-- CreateTable
CREATE TABLE "UsageDistinct" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "feature" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "UsageDistinct_pkey" PRIMARY KEY ("userId","day","feature","key")
);

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAudit_targetId_createdAt_idx" ON "AdminAudit"("targetId", "createdAt");


-- Indexes, each measured with EXPLAIN ANALYZE on the full 2023-2026 data (docs/PLANS_AND_ROLES.md "Indexes").
-- Residents search: trigram index on the name (ILIKE '%token%'); server/residents-all.ts looks the token's colleges up
-- first so each token is a BitmapOr of this and the collegeId index. pg_trgm lives in schema "extensions" on Supabase;
-- created there elsewhere too, and the operator class is taken from wherever it is installed.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
DO $$
DECLARE s text;
BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX "Resident_name_trgm_idx" ON "Resident" USING GIN ("name" %I.gin_trgm_ops)', s);
END $$;

-- Residents sorted by name (with or without a year filter): an index scan instead of sorting every row.
CREATE INDEX "Resident_name_year_id_idx" ON "Resident"("name", "year" DESC, "id");

-- The Residents Year filter's years (GROUP BY year WHERE NOT hidden): an index-only scan.
CREATE INDEX "Resident_hidden_year_idx" ON "Resident"("hidden", "year");
