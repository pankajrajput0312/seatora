-- AlterTable
ALTER TABLE "CollegeTerm" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "RetiredCollegeKey" (
    "oldKey" TEXT NOT NULL,
    "oldSlug" TEXT,
    "newKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredCollegeKey_pkey" PRIMARY KEY ("oldKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetiredCollegeKey_oldSlug_key" ON "RetiredCollegeKey"("oldSlug");
