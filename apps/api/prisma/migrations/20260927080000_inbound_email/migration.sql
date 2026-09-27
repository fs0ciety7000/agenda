-- AlterTable
ALTER TABLE "HouseholdMember" ADD COLUMN "inboundToken" VARCHAR(40);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_inboundToken_key" ON "HouseholdMember"("inboundToken");
