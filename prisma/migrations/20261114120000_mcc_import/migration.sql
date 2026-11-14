-- CreateEnum
CREATE TYPE "TermKind" AS ENUM ('FEE', 'STIPEND', 'BOND', 'PENALTY');

-- AlterTable
ALTER TABLE "DataSource" ADD COLUMN     "counsellingYear" INTEGER,
ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "round" TEXT;

-- AlterTable
ALTER TABLE "College" ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "pincode" TEXT,
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "state" DROP NOT NULL,
ALTER COLUMN "type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Cutoff" ADD COLUMN     "n" INTEGER NOT NULL,
DROP COLUMN "quota",
ADD COLUMN     "quota" TEXT NOT NULL;

-- DropEnum
DROP TYPE "Quota";

-- CreateTable
CREATE TABLE "CollegeTerm" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "kind" "TermKind" NOT NULL,
    "text" TEXT NOT NULL,
    "amountInr" INTEGER,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "CollegeTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollegeTerm_collegeId_program_kind_key" ON "CollegeTerm"("collegeId", "program", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "College_key_key" ON "College"("key");

-- CreateIndex
CREATE INDEX "CollegeSpecialty_specialtyId_idx" ON "CollegeSpecialty"("specialtyId");

-- CreateIndex
CREATE INDEX "Cutoff_counsellingYear_category_closingRank_idx" ON "Cutoff"("counsellingYear", "category", "closingRank");

-- CreateIndex
CREATE INDEX "Cutoff_sourceId_idx" ON "Cutoff"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Cutoff_collegeSpecialtyId_counsellingYear_round_quota_categ_key" ON "Cutoff"("collegeSpecialtyId", "counsellingYear", "round", "quota", "category");

-- AddForeignKey
ALTER TABLE "CollegeTerm" ADD CONSTRAINT "CollegeTerm_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeTerm" ADD CONSTRAINT "CollegeTerm_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

