-- Names from MCC's admitted-candidates lists (private bundle, prisma/import-residents.ts). No roll numbers or contact details.
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER,
    "list" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Resident_collegeId_year_idx" ON "Resident"("collegeId", "year");
CREATE INDEX "Resident_specialtyId_idx" ON "Resident"("specialtyId");

ALTER TABLE "Resident" ADD CONSTRAINT "Resident_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
