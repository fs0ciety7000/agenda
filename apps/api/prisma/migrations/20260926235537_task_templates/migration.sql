-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "emoji" VARCHAR(8),
    "items" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_householdId_idx" ON "TaskTemplate"("householdId");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
