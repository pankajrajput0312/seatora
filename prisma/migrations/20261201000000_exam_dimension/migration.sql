-- Multi-exam groundwork (src/features/exams): an exam on every dataset table, NEET PG by default, so every existing row
-- is NEET PG's and nothing is rewritten. Keys a second exam would collide on get the exam in them. Colleges stay shared:
-- CollegeExam says which exams' bundles have each one.

ALTER TABLE "DataSource" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "Specialty" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "Cutoff" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "Allotment" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "CollegeTerm" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "Announcement" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';
ALTER TABLE "MeritList" ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg';

-- Unique per exam: the new key first, then the old one goes.
CREATE UNIQUE INDEX "DataSource_exam_key_key" ON "DataSource"("exam", "key");
DROP INDEX "DataSource_key_key";
CREATE UNIQUE INDEX "Specialty_exam_slug_key" ON "Specialty"("exam", "slug");
DROP INDEX "Specialty_slug_key";
CREATE UNIQUE INDEX "CollegeTerm_exam_collegeId_program_kind_key" ON "CollegeTerm"("exam", "collegeId", "program", "kind");
DROP INDEX "CollegeTerm_collegeId_program_kind_key";
CREATE UNIQUE INDEX "MeritList_exam_year_key" ON "MeritList"("exam", "year");
DROP INDEX "MeritList_year_key";

ALTER TABLE "ClinicalFacts" DROP CONSTRAINT "ClinicalFacts_pkey",
ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg',
ADD CONSTRAINT "ClinicalFacts_pkey" PRIMARY KEY ("exam", "collegeId");

ALTER TABLE "FeesStructured" DROP CONSTRAINT "FeesStructured_pkey",
ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg',
ADD CONSTRAINT "FeesStructured_pkey" PRIMARY KEY ("exam", "collegeId", "programme", "quotaGroup");

ALTER TABLE "RoundStep" DROP CONSTRAINT "RoundStep_pkey",
ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg',
ADD CONSTRAINT "RoundStep_pkey" PRIMARY KEY ("exam", "year", "round", "step");

ALTER TABLE "ScoreRank" DROP CONSTRAINT "ScoreRank_pkey",
ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg',
ADD CONSTRAINT "ScoreRank_pkey" PRIMARY KEY ("exam", "year", "score");

ALTER TABLE "MeritPosition" DROP CONSTRAINT "MeritPosition_pkey",
ADD COLUMN "exam" TEXT NOT NULL DEFAULT 'neet-pg',
ADD CONSTRAINT "MeritPosition_pkey" PRIMARY KEY ("exam", "year", "category", "aiqRank");

CREATE TABLE "CollegeExam" (
    "exam" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,

    CONSTRAINT "CollegeExam_pkey" PRIMARY KEY ("exam","collegeId")
);
ALTER TABLE "CollegeExam" ADD CONSTRAINT "CollegeExam_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Every college today is NEET PG's.
INSERT INTO "CollegeExam" ("exam", "collegeId") SELECT 'neet-pg', "id" FROM "College";

-- Statistics for the new columns now: without them the planner guesses 0.5% for exam = 'neet-pg' (it is every row)
-- and may pick other plans for NEET PG's queries until autovacuum gets to these tables.
ANALYZE "DataSource", "Specialty", "Cutoff", "Allotment", "CollegeTerm", "Announcement", "MeritList", "ClinicalFacts", "FeesStructured", "RoundStep", "ScoreRank", "MeritPosition", "CollegeExam";
