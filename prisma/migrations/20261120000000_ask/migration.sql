-- Ask Seatora (owner only): usage log (no message text) and saved plan reports.
CREATE TABLE "AskLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "tools" TEXT[],
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'started',

    CONSTRAINT "AskLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AskReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AskLog_userId_createdAt_idx" ON "AskLog"("userId", "createdAt");
CREATE INDEX "AskReport_userId_createdAt_idx" ON "AskReport"("userId", "createdAt");

ALTER TABLE "AskLog" ADD CONSTRAINT "AskLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AskReport" ADD CONSTRAINT "AskReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
