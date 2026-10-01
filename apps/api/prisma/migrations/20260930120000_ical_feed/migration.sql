-- AlterTable
ALTER TABLE "HouseholdMember" ADD COLUMN "icalToken" VARCHAR(40);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_icalToken_key" ON "HouseholdMember"("icalToken");
