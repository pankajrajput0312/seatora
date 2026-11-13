-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL', 'VERIFIED_INSTITUTIONAL', 'THIRD_PARTY_RESEARCH', 'STUDENT_REPORTED', 'UNVERIFIED_COMMUNITY');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'DISPUTED', 'OUTDATED');

-- CreateEnum
CREATE TYPE "CollegeType" AS ENUM ('GOVERNMENT', 'PRIVATE', 'DEEMED', 'CENTRAL');

-- CreateEnum
CREATE TYPE "Quota" AS ENUM ('AIQ', 'STATE', 'DEEMED', 'CENTRAL_INSTITUTE', 'MANAGEMENT', 'NRI');

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "type" "SourceType" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "type" "CollegeType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "degree" TEXT NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollegeSpecialty" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,

    CONSTRAINT "CollegeSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cutoff" (
    "id" TEXT NOT NULL,
    "collegeSpecialtyId" TEXT NOT NULL,
    "counsellingYear" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "quota" "Quota" NOT NULL,
    "category" TEXT NOT NULL,
    "openingRank" INTEGER,
    "closingRank" INTEGER,
    "sourceId" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Cutoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "counsellingYear" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "officialUrl" TEXT,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "examYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "College_slug_key" ON "College"("slug");

-- CreateIndex
CREATE INDEX "College_state_idx" ON "College"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_slug_key" ON "Specialty"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CollegeSpecialty_collegeId_specialtyId_key" ON "CollegeSpecialty"("collegeId", "specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "Cutoff_collegeSpecialtyId_counsellingYear_round_quota_categ_key" ON "Cutoff"("collegeSpecialtyId", "counsellingYear", "round", "quota", "category");

-- CreateIndex
CREATE INDEX "Announcement_counsellingYear_authority_idx" ON "Announcement"("counsellingYear", "authority");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");

-- AddForeignKey
ALTER TABLE "College" ADD CONSTRAINT "College_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeSpecialty" ADD CONSTRAINT "CollegeSpecialty_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeSpecialty" ADD CONSTRAINT "CollegeSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cutoff" ADD CONSTRAINT "Cutoff_collegeSpecialtyId_fkey" FOREIGN KEY ("collegeSpecialtyId") REFERENCES "CollegeSpecialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cutoff" ADD CONSTRAINT "Cutoff_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
