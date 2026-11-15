-- Resident: the merit list behind the rank, and the one MCC allotment it matched (quota, round), for the Residents tab
-- across institutes. Null from an older residents bundle. No reservation category, by design.
ALTER TABLE "Resident" ADD COLUMN "rankBasis" TEXT,
ADD COLUMN "match" TEXT,
ADD COLUMN "quota" TEXT,
ADD COLUMN "round" TEXT;

-- CreateIndex
CREATE INDEX "Resident_year_rank_idx" ON "Resident"("year", "rank");
