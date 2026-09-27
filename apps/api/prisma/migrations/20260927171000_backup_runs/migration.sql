-- CreateTable
CREATE TABLE "BackupRun" (
    "id" UUID NOT NULL,
    "trigger" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "requestedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "file" VARCHAR(255),
    "sizeBytes" BIGINT,
    "summary" VARCHAR(500),
    "offsite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_createdAt_idx" ON "BackupRun"("createdAt");

