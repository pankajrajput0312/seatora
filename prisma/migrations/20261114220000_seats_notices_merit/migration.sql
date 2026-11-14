-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "round" TEXT;

-- CreateTable
CREATE TABLE "SeatSource" (
    "sourceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "SeatSource_pkey" PRIMARY KEY ("sourceId")
);

-- CreateTable
CREATE TABLE "SeatCount" (
    "id" TEXT NOT NULL,
    "seatSourceId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "specialtyId" TEXT,
    "collegeSpecialtyId" TEXT,
    "degree" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quota" TEXT,
    "category" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,

    CONSTRAINT "SeatCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundStep" (
    "year" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "date" TEXT,
    "url" TEXT,
    "title" TEXT,
    "note" TEXT,
    "scheduledFrom" TEXT,
    "scheduledTo" TEXT,
    "scheduledOn" TEXT,
    "tentative" BOOLEAN NOT NULL DEFAULT false,
    "events" JSONB NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundStep_pkey" PRIMARY KEY ("year","round","step")
);

-- CreateTable
CREATE TABLE "MeritList" (
    "sourceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "maxMarks" INTEGER NOT NULL,
    "candidates" INTEGER NOT NULL,
    "coverage" TEXT NOT NULL,
    "noticeUrl" TEXT NOT NULL,
    "step" INTEGER,
    "qualified" JSONB,

    CONSTRAINT "MeritList_pkey" PRIMARY KEY ("sourceId")
);

-- CreateTable
CREATE TABLE "ScoreRank" (
    "year" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "bestRank" INTEGER NOT NULL,
    "worstRank" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "ScoreRank_pkey" PRIMARY KEY ("year","score")
);

-- CreateTable
CREATE TABLE "MeritPosition" (
    "year" INTEGER NOT NULL,
    "aiqRank" INTEGER NOT NULL,
    "maxAir" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "MeritPosition_pkey" PRIMARY KEY ("year","category","aiqRank")
);

-- CreateIndex
CREATE INDEX "SeatSource_year_round_kind_idx" ON "SeatSource"("year", "round", "kind");

-- CreateIndex
CREATE INDEX "SeatCount_seatSourceId_code_idx" ON "SeatCount"("seatSourceId", "code");

-- CreateIndex
CREATE INDEX "SeatCount_collegeSpecialtyId_seatSourceId_idx" ON "SeatCount"("collegeSpecialtyId", "seatSourceId");

-- CreateIndex
CREATE INDEX "SeatCount_collegeId_seatSourceId_idx" ON "SeatCount"("collegeId", "seatSourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MeritList_year_key" ON "MeritList"("year");

-- CreateIndex
CREATE INDEX "ScoreRank_year_bestRank_idx" ON "ScoreRank"("year", "bestRank");

-- CreateIndex
CREATE INDEX "MeritPosition_year_category_maxAir_idx" ON "MeritPosition"("year", "category", "maxAir");

-- AddForeignKey
ALTER TABLE "SeatSource" ADD CONSTRAINT "SeatSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatCount" ADD CONSTRAINT "SeatCount_seatSourceId_fkey" FOREIGN KEY ("seatSourceId") REFERENCES "SeatSource"("sourceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatCount" ADD CONSTRAINT "SeatCount_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatCount" ADD CONSTRAINT "SeatCount_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatCount" ADD CONSTRAINT "SeatCount_collegeSpecialtyId_fkey" FOREIGN KEY ("collegeSpecialtyId") REFERENCES "CollegeSpecialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritList" ADD CONSTRAINT "MeritList_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreRank" ADD CONSTRAINT "ScoreRank_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MeritList"("sourceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritPosition" ADD CONSTRAINT "MeritPosition_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MeritList"("sourceId") ON DELETE CASCADE ON UPDATE CASCADE;

