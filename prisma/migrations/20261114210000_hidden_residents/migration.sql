-- Hides outlive the Resident rows that prisma/import-residents.ts replaces and prisma/import-mcc.ts cascades away.
CREATE TABLE "HiddenResident" (
    "name" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenResident_pkey" PRIMARY KEY ("name","place")
);

-- The hides made so far.
INSERT INTO "HiddenResident" ("name", "place")
SELECT DISTINCT r."name", COALESCE(c."pincode", c."key")
FROM "Resident" r JOIN "College" c ON c."id" = r."collegeId"
WHERE r."hidden";
