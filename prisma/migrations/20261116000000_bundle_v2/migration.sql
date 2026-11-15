-- Bundle schema 2 (neetpg-planner data/medpath-r3): college MCC ids, profile, inferred type and website; the allotted
-- candidate's category, option number and previous-round seat; clinical facts; the per-year fee table.

-- College.type held the unused CollegeType enum (always null): now the bundle's inferred type, as text.
ALTER TABLE "College" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
DROP TYPE "CollegeType";
ALTER TABLE "College" ADD COLUMN "mccIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mccProfileUrl" TEXT,
ADD COLUMN "typeBasis" TEXT,
ADD COLUMN "website" TEXT;

ALTER TABLE "Allotment" ADD COLUMN "candidateCategory" TEXT,
ADD COLUMN "optionNo" INTEGER,
ADD COLUMN "prevCollegeId" TEXT,
ADD COLUMN "prevQuota" TEXT,
ADD COLUMN "prevRemark" TEXT,
ADD COLUMN "prevSpecialtyId" TEXT;

CREATE TABLE "ClinicalFacts" (
    "collegeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "disclosureStatus" TEXT NOT NULL,
    "disclosureUrl" TEXT,
    "checkedAt" DATE,

    CONSTRAINT "ClinicalFacts_pkey" PRIMARY KEY ("collegeId")
);

CREATE TABLE "FeesStructured" (
    "collegeId" TEXT NOT NULL,
    "programme" TEXT NOT NULL,
    "quotaGroup" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "FeesStructured_pkey" PRIMARY KEY ("collegeId","programme","quotaGroup")
);

ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_prevCollegeId_fkey" FOREIGN KEY ("prevCollegeId") REFERENCES "College"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Allotment" ADD CONSTRAINT "Allotment_prevSpecialtyId_fkey" FOREIGN KEY ("prevSpecialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalFacts" ADD CONSTRAINT "ClinicalFacts_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeesStructured" ADD CONSTRAINT "FeesStructured_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
