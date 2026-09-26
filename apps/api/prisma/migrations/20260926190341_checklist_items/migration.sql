-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "occurrenceId" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneById" UUID,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistItem_occurrenceId_position_idx" ON "ChecklistItem"("occurrenceId", "position");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "TaskOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
