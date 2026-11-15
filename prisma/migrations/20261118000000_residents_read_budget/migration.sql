-- Residents: name reads per account per day (the daily cap of residentsBudget, shared by every server instance).
CREATE TABLE "ResidentsRead" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ResidentsRead_pkey" PRIMARY KEY ("userId","day")
);
