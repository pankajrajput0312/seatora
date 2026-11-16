-- Ask Seatora: saved chats, remembered preferences, and the answer check's counts in the usage log.
ALTER TABLE "AskLog" ADD COLUMN "conversationId" TEXT,
ADD COLUMN "checkPassed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "checkFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "corrected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "timing" JSONB;

CREATE TABLE "AskConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AskMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "thinking" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "segment" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "phase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AskPreference" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskPreference_pkey" PRIMARY KEY ("userId","key")
);

CREATE INDEX "AskConversation_userId_updatedAt_idx" ON "AskConversation"("userId", "updatedAt");
CREATE INDEX "AskMessage_conversationId_createdAt_idx" ON "AskMessage"("conversationId", "createdAt");
CREATE UNIQUE INDEX "AskMessage_conversationId_requestId_role_key" ON "AskMessage"("conversationId", "requestId", "role");

ALTER TABLE "AskConversation" ADD CONSTRAINT "AskConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AskMessage" ADD CONSTRAINT "AskMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AskConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AskPreference" ADD CONSTRAINT "AskPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
