-- Canonical specialty code (e.g. "ANAESTHESIOLOGY") so MD and DNB of one discipline can be filtered together.
-- Nullable: existing rows get it from the next `npm run db:import`.
ALTER TABLE "Specialty" ADD COLUMN "code" TEXT;

-- One row per seat allotment printed in an MCC result PDF (rank and seat only; no names, roll numbers or application ids).
CREATE TABLE "Allotment" (
    "id" TEXT NOT NULL,
    "collegeSpecialtyId" TEXT NOT NULL,
    "counsellingYear" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "quota" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "Allotment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Allotment_counsellingYear_rank_idx" ON "Allotment"("counsellingYear", "rank");
CREATE INDEX "Allotment_collegeSpecialtyId_counsellingYear_round_idx" ON "Allotment"("collegeSpecialtyId", "counsellingYear", "round");
CREATE INDEX "Allotment_sourceId_idx" ON "Allotment"("sourceId");

ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_collegeSpecialtyId_fkey" FOREIGN KEY ("collegeSpecialtyId") REFERENCES "CollegeSpecialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
