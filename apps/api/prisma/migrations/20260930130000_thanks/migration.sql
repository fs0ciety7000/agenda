-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_THANKS';

-- CreateTable
CREATE TABLE "OccurrenceThanks" (
    "occurrenceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccurrenceThanks_pkey" PRIMARY KEY ("occurrenceId","memberId")
);

-- CreateIndex
CREATE INDEX "OccurrenceThanks_memberId_idx" ON "OccurrenceThanks"("memberId");

-- AddForeignKey
ALTER TABLE "OccurrenceThanks" ADD CONSTRAINT "OccurrenceThanks_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceThanks" ADD CONSTRAINT "OccurrenceThanks_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HouseholdMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
